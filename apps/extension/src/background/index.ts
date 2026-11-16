/**
 * Service worker. Owns permissions, downloads and per-tab media state.
 * Every incoming message is validated (shared/messages.ts) and must come from
 * this extension's own content script or popup.
 */
import { matchUrl } from '@downora/source-adapters';
import type { DetectedMedia, ExtensionDownload } from '@downora/types';
import { downloadFileName } from '../shared/filename';
import {
  parseContentMessage,
  parsePopupMessage,
  type DesktopState,
  type DownloadRequest,
  type Result,
  type TabState,
  type WorkerEvent,
} from '../shared/messages';
import { dashboardLink, loadSettings } from '../shared/settings';
import { probe } from './probe';
import * as desktop from '../shared/desktop';

const SCRIPT_ID = 'downora-detect';
const ALL_SITES = ['https://*/*', 'http://*/*'];
const MAX_HISTORY = 50;

// ───────────────────────── storage helpers ─────────────────────────

async function getSites(): Promise<string[]> {
  const { sites } = await chrome.storage.local.get('sites');
  return Array.isArray(sites) ? sites.filter((s): s is string => typeof s === 'string') : [];
}
async function setSites(sites: string[]) {
  await chrome.storage.local.set({ sites: [...new Set(sites)] });
}

async function getDownloads(): Promise<ExtensionDownload[]> {
  const { downloads } = await chrome.storage.local.get('downloads');
  return Array.isArray(downloads) ? (downloads as ExtensionDownload[]) : [];
}
async function setDownloads(list: ExtensionDownload[]) {
  await chrome.storage.local.set({ downloads: list.slice(0, MAX_HISTORY) });
  broadcast({ type: 'downloads/changed', downloads: list.slice(0, MAX_HISTORY) });
}

const tabKey = (tabId: number) => `tab:${tabId}`;
async function getTabMedia(tabId: number): Promise<{ media: DetectedMedia[]; scanned: boolean }> {
  const v = (await chrome.storage.session.get(tabKey(tabId)))[tabKey(tabId)] as { media: DetectedMedia[] } | undefined;
  return { media: v?.media ?? [], scanned: Boolean(v) };
}

/** Tabs that started a download hear about its progress. */
const listeners = new Map<number, number>(); // downloadId → tabId

function broadcast(event: WorkerEvent) {
  chrome.runtime.sendMessage(event).catch(() => {}); // popup, if open
  for (const tabId of new Set(listeners.values())) chrome.tabs.sendMessage(tabId, event).catch(() => {});
}

// ───────────────────────── permissions & registration ─────────────────────────

const originPattern = (origin: string) => (origin === '*' ? ALL_SITES : [`${origin}/*`]);

async function hasAccess(origin: string): Promise<boolean> {
  const sites = await getSites();
  if (!sites.includes(origin) && !sites.includes('*')) return false;
  const patterns = sites.includes('*') && !sites.includes(origin) ? ALL_SITES : originPattern(origin);
  return chrome.permissions.contains({ origins: patterns });
}

/** Keep the registered content script in step with the sites the user allowed. */
export async function syncRegistration(): Promise<string[]> {
  const sites = await getSites();
  const matches: string[] = [];
  for (const site of sites) {
    const patterns = originPattern(site);
    if (await chrome.permissions.contains({ origins: patterns })) matches.push(...patterns);
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (matches.length === 0) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return [];
  }
  const script: chrome.scripting.RegisteredContentScript = {
    id: SCRIPT_ID,
    matches: [...new Set(matches)],
    js: ['content.js'],
    runAt: 'document_idle',
    persistAcrossSessions: true,
    allFrames: false,
  };
  if (existing.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
  return script.matches!;
}

// ───────────────────────── downloads ─────────────────────────

let poll: ReturnType<typeof setInterval> | undefined;

async function refreshProgress() {
  const list = await getDownloads();
  const active = list.filter((d) => d.state === 'in_progress');
  if (active.length === 0) {
    if (poll) clearInterval(poll);
    poll = undefined;
    return;
  }
  let changed = false;
  for (const d of active) {
    const [item] = await chrome.downloads.search({ id: d.id });
    if (!item) continue;
    const next = applyItem(d, item);
    if (next !== d) {
      Object.assign(d, next);
      changed = true;
    }
  }
  if (changed) await setDownloads(list);
}

function ensurePolling() {
  // chrome.downloads.onChanged doesn't fire for byte counts, so poll while
  // something is downloading. Each API call keeps the worker alive.
  if (!poll) poll = setInterval(() => void refreshProgress(), 400);
}

const ERRORS: Record<string, string> = {
  NETWORK_FAILED: 'The network connection failed.',
  NETWORK_TIMEOUT: 'The server took too long to respond.',
  NETWORK_DISCONNECTED: 'You went offline.',
  SERVER_FORBIDDEN: 'The site refused the download.',
  SERVER_UNAUTHORIZED: 'The site requires signing in. Downora never signs in for you.',
  SERVER_BAD_CONTENT: 'The file is no longer at this address.',
  SERVER_FAILED: 'The server failed to send the file.',
  FILE_NO_SPACE: 'Your disk is full.',
  FILE_ACCESS_DENIED: 'Chrome couldn’t write to your Downloads folder.',
  FILE_BLOCKED: 'Chrome or your computer blocked this file.',
  USER_CANCELED: 'Canceled.',
};

/** Chrome may rename to "name (1).mp4" to avoid clashes; show that, otherwise the name we asked for. */
function savedName(requested: string, path: string): string {
  const base = path.split(/[\\/]/).pop() ?? '';
  const stem = requested.replace(/\.[^.]+$/, '');
  return base.startsWith(stem) ? base : requested;
}

function applyItem(d: ExtensionDownload, item: chrome.downloads.DownloadItem): ExtensionDownload {
  const next: ExtensionDownload = {
    ...d,
    state: item.state as ExtensionDownload['state'],
    paused: item.paused,
    bytesReceived: item.bytesReceived,
    bytesTotal: item.totalBytes > 0 ? item.totalBytes : d.bytesTotal,
    fileName: savedName(d.fileName, item.filename),
    error: item.error ? ERRORS[item.error] ?? `Chrome stopped the download (${item.error}).` : undefined,
    endedAt: item.state !== 'in_progress' ? (item.endTime ?? new Date().toISOString()) : undefined,
  };
  return JSON.stringify(next) === JSON.stringify(d) ? d : next;
}

// ───────────────────────── Downora Desktop ─────────────────────────

let desktopPoll: ReturnType<typeof setInterval> | undefined;

async function refreshDesktopJobs() {
  const list = await getDownloads();
  const active = list.filter((d) => d.via === 'desktop' && d.state === 'in_progress' && d.desktopJobId);
  if (!active.length) {
    if (desktopPoll) clearInterval(desktopPoll);
    desktopPoll = undefined;
    return;
  }
  let changed = false;
  for (const d of active) {
    try {
      const j = await desktop.jobStatus(d.desktopJobId!);
      const next: ExtensionDownload = {
        ...d,
        fileName: j.fileName || d.fileName,
        bytesReceived: j.bytesReceived,
        bytesTotal: j.bytesTotal ?? d.bytesTotal,
        paused: j.status === 'paused',
        state: j.status === 'completed' ? 'complete' : j.done ? 'interrupted' : 'in_progress',
        error: j.status === 'canceled' ? 'Canceled in Downora Desktop.' : j.error ?? undefined,
        endedAt: j.done ? new Date().toISOString() : undefined,
      };
      if (JSON.stringify(next) !== JSON.stringify(d)) {
        Object.assign(d, next);
        changed = true;
      }
    } catch (e) {
      if (e instanceof desktop.DesktopError && e.kind !== 'offline') {
        Object.assign(d, { state: 'interrupted', error: e.message, endedAt: new Date().toISOString() });
        changed = true;
      }
    }
  }
  if (changed) await setDownloads(list);
}

async function desktopState(): Promise<DesktopState> {
  const key = await desktop.loadKey();
  if (!key) return { paired: false, reachable: null };
  try {
    const s = await desktop.status();
    return { paired: true, pairedAt: key.pairedAt, reachable: true, version: s.version };
  } catch (e) {
    return { paired: true, pairedAt: key.pairedAt, reachable: false, error: e instanceof Error ? e.message : undefined };
  }
}

/** Tries the desktop app; returns null when Chrome should handle it instead, plus why. */
async function viaDesktop(req: DownloadRequest, pageHost: string): Promise<{ result: Result<{ id: number }> | null; note?: string }> {
  const settings = await loadSettings();
  if (!settings.sendToDesktop || !(await desktop.loadKey())) return { result: null };
  try {
    const sent = await desktop.sendJob({ url: req.url, title: req.title, container: req.container });
    const id = -Date.now(); // desktop entries get negative ids; Chrome's are positive
    const record: ExtensionDownload = {
      id,
      url: req.url,
      fileName: sent.fileName,
      title: req.title,
      kind: req.kind,
      container: req.container,
      pageHost,
      state: 'in_progress',
      paused: false,
      bytesReceived: 0,
      startedAt: new Date().toISOString(),
      via: 'desktop',
      desktopJobId: sent.jobId,
    };
    await setDownloads([record, ...(await getDownloads())]);
    if (!desktopPoll) desktopPoll = setInterval(() => void refreshDesktopJobs(), 700);
    return { result: { ok: true, data: { id } } };
  } catch (e) {
    const why = e instanceof desktop.DesktopError ? e.message : 'Downora Desktop didn’t respond.';
    return { result: null, note: `${why} Chrome saved this file instead.` };
  }
}

chrome.alarms.create('desktop-heartbeat', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== 'desktop-heartbeat') return;
  void (async () => {
    if (!(await desktop.loadKey())) return;
    await desktop.status().catch(() => {});
    await desktop.rotateIfDue().catch(() => {});
  })();
});

async function startDownload(req: DownloadRequest, tabId: number | undefined, pageHost: string): Promise<Result<{ id: number }>> {
  const handoff = await viaDesktop(req, pageHost);
  if (handoff.result) {
    if (handoff.result.ok && tabId !== undefined) listeners.set(handoff.result.data.id, tabId);
    return handoff.result;
  }
  const settings = await loadSettings();
  const fileName = downloadFileName(req.title, req.container);
  let id: number;
  try {
    id = await chrome.downloads.download({ url: req.url, filename: fileName, saveAs: settings.askWhereToSave, conflictAction: 'uniquify' });
  } catch (error) {
    return { ok: false, error: `Chrome couldn’t start the download. ${error instanceof Error ? error.message : ''}`.trim() };
  }
  if (tabId !== undefined) listeners.set(id, tabId);
  const record: ExtensionDownload = {
    id,
    url: req.url,
    fileName,
    title: req.title,
    kind: req.kind,
    container: req.container,
    pageHost,
    state: 'in_progress',
    paused: false,
    bytesReceived: 0,
    startedAt: new Date().toISOString(),
    via: 'chrome',
    note: handoff.note,
  };
  await setDownloads([record, ...(await getDownloads()).filter((d) => d.id !== id)]);
  ensurePolling();
  return { ok: true, data: { id } };
}

chrome.downloads.onChanged.addListener((delta) => {
  void (async () => {
    const list = await getDownloads();
    const d = list.find((x) => x.id === delta.id);
    if (!d) return;
    const [item] = await chrome.downloads.search({ id: delta.id });
    if (!item) return;
    const next = applyItem(d, item);
    if (next !== d) {
      Object.assign(d, next);
      await setDownloads(list);
    }
    if (item.state === 'in_progress') ensurePolling();
  })();
});

// ───────────────────────── tab state ─────────────────────────

function originOf(url?: string): string | undefined {
  try {
    const u = new URL(url ?? '');
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

const RESTRICTED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

async function tabState(tabId: number): Promise<TabState> {
  const tab = await chrome.tabs.get(tabId);
  const { media, scanned } = await getTabMedia(tabId);
  // Without access Chrome hides the address; that's "off", not "restricted".
  if (tab.url === undefined) return { tabId, access: 'off', scanned, media };
  const origin = originOf(tab.url);
  if (!origin || RESTRICTED_HOSTS.includes(new URL(origin).host)) {
    return { tabId, url: tab.url, access: 'restricted', scanned: false, media: [] };
  }
  return { tabId, url: tab.url, origin, access: (await hasAccess(origin)) ? 'enabled' : 'off', scanned, media };
}

async function setBadge(tabId: number, count: number) {
  await chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#F36444' }).catch(() => {});
}

chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(tabKey(tabId)));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) {
    void chrome.storage.session.remove(tabKey(tabId));
    void setBadge(tabId, 0);
  }
});

// ───────────────────────── messages ─────────────────────────

/** The popup (or any of this extension's own pages, e.g. the popup opened in a tab). */
const isOwnPage = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id && (sender.url ?? '').startsWith(chrome.runtime.getURL(''));

async function handleContent(raw: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const msg = parseContentMessage(raw);
  const tabId = sender.tab?.id;
  if (!msg || tabId === undefined || sender.frameId !== 0) return { ok: false, error: 'Rejected message.' };
  const pageHost = originOf(sender.tab?.url) ? new URL(sender.tab!.url!).host : '';
  switch (msg.type) {
    case 'media/update':
      await chrome.storage.session.set({ [tabKey(tabId)]: { media: msg.media } });
      await setBadge(tabId, msg.media.length);
      chrome.runtime.sendMessage({ type: 'tab/changed', tabId }).catch(() => {});
      return { ok: true };
    case 'media/probe':
      return probe(msg.url);
    case 'download/start':
      return startDownload(msg.request, tabId, pageHost);
    case 'dashboard/open': {
      const settings = await loadSettings();
      const kind = matchUrl(new URL(msg.url))?.kind ?? 'video';
      await chrome.tabs.create({ url: dashboardLink(settings.dashboardUrl, msg.url, kind), index: (sender.tab?.index ?? 0) + 1 });
      return { ok: true };
    }
  }
}

async function handlePopup(raw: unknown): Promise<unknown> {
  const msg = parsePopupMessage(raw);
  if (!msg) return { ok: false, error: 'Rejected message.' };
  switch (msg.type) {
    case 'tab/state':
      return { ok: true, data: await tabState(msg.tabId) };
    case 'tab/scan': {
      try {
        await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: ['content.js'] });
        return { ok: true, data: null };
      } catch {
        return { ok: false, error: 'Chrome didn’t let Downora read this page. Open the Downora menu from the toolbar on the page itself, or turn Downora on for this site.' };
      }
    }
    case 'site/enabled': {
      const patterns = originPattern(msg.origin);
      if (!(await chrome.permissions.contains({ origins: patterns }))) {
        return { ok: false, error: 'Permission wasn’t granted, so Downora stays off for this site.' };
      }
      await setSites([...(await getSites()), msg.origin]);
      return { ok: true, data: await syncRegistration() };
    }
    case 'site/disable': {
      await setSites((await getSites()).filter((s) => s !== msg.origin));
      await chrome.permissions.remove({ origins: originPattern(msg.origin) }).catch(() => false);
      return { ok: true, data: await syncRegistration() };
    }
    case 'download/start': {
      const tab = msg.tabId !== undefined ? await chrome.tabs.get(msg.tabId).catch(() => undefined) : undefined;
      return startDownload(msg.request, msg.tabId, originOf(tab?.url) ? new URL(tab!.url!).host : '');
    }
    case 'downloads/list':
      return { ok: true, data: await getDownloads() };
    case 'downloads/retry': {
      const d = (await getDownloads()).find((x) => x.id === msg.id);
      if (!d) return { ok: false, error: 'That download is no longer in the list.' };
      await setDownloads((await getDownloads()).filter((x) => x.id !== msg.id));
      return startDownload({ url: d.url, title: d.title, container: d.container, kind: d.kind }, undefined, d.pageHost);
    }
    case 'downloads/cancel':
      if (msg.id > 0) await chrome.downloads.cancel(msg.id).catch(() => {});
      return { ok: true, data: null };
    case 'downloads/clear':
      await setDownloads((await getDownloads()).filter((d) => d.state === 'in_progress'));
      return { ok: true, data: null };
    case 'downloads/show':
      if (msg.id > 0) chrome.downloads.show(msg.id);
      return { ok: true, data: null };
    case 'desktop/state':
      return { ok: true, data: await desktopState() };
    case 'desktop/pair': {
      if (!(await chrome.permissions.contains({ origins: [desktop.DESKTOP_PERMISSION] }))) {
        return { ok: false, error: 'Chrome didn’t allow Downora to talk to the desktop app.' };
      }
      try {
        await desktop.pair(msg.code);
        return { ok: true, data: await desktopState() };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Pairing failed.' };
      }
    }
    case 'desktop/unpair':
      await desktop.deleteKey();
      return { ok: true, data: await desktopState() };
  }
}

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  // Route by who sent it: our own pages get the popup API, web pages (content
  // scripts) get the narrow content API.
  const handler = isOwnPage(sender) ? handlePopup(raw) : sender.tab ? handleContent(raw, sender) : null;
  if (!handler) return false;
  handler.then(sendResponse, (error: unknown) =>
    sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' }),
  );
  return true;
});

chrome.runtime.onInstalled.addListener(() => void syncRegistration());
chrome.runtime.onStartup.addListener(() => void syncRegistration());
chrome.permissions.onRemoved.addListener(() => void syncRegistration());
