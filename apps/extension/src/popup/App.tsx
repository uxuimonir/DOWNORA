import type { DetectedMedia, DetectedSource, ExtensionDownload } from '@downora/types';
import { Badge, Button, cn, Input, Logo, SegmentedControl, Skeleton, Switch, ThemeSwitcher, TransferTrack, useApplyTheme } from '@downora/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Film,
  FolderOpen,
  Globe,
  Lock,
  Music2,
  RotateCcw,
  ScanSearch,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { qualityOf, formatBytes } from '../content/overlay';
import { checkApi, type ApiStatus } from '../shared/api';
import type { PopupMessage, Result, TabState } from '../shared/messages';
import { dashboardLink, DEFAULT_SETTINGS, loadSettings, saveSettings, type ExtensionSettings } from '../shared/settings';

type View = 'page' | 'downloads' | 'settings';

async function send<T>(message: PopupMessage): Promise<Result<T>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as Result<T>;
  } catch {
    return { ok: false, error: 'Downora’s background service didn’t respond. Try closing and reopening this menu.' };
  }
}

/** The tab the popup belongs to. `?tabId=` lets automated tests open the popup as a page. */
async function currentTabId(): Promise<number | undefined> {
  const forced = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(forced) && forced > 0) return forced;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function formatDuration(sec?: number) {
  if (!sec) return null;
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex min-h-6 items-center justify-between px-1">
        <h2 className="label-mono">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Notice({ tone = 'neutral', icon, children }: { tone?: 'neutral' | 'danger' | 'success'; icon?: ReactNode; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2.5 rounded-panel border p-3.5 text-[0.8125rem] leading-snug',
        tone === 'danger' ? 'border-danger/30 bg-danger/10 text-ink' : tone === 'success' ? 'border-success/30 bg-success/10' : 'border-line bg-surface text-ink-muted',
      )}
    >
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<View>('page');
  const [tabId, setTabId] = useState<number>();
  const [tab, setTab] = useState<TabState | null>(null);
  const [tabError, setTabError] = useState<string>();
  const [scanning, setScanning] = useState(false);
  const [downloads, setDownloads] = useState<ExtensionDownload[]>([]);
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [flash, setFlash] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useApplyTheme(settings.theme);

  const refreshTab = useCallback(async (id: number) => {
    const res = await send<TabState>({ type: 'tab/state', tabId: id });
    if (res.ok) {
      setTab(res.data);
      setTabError(undefined);
    } else setTabError(res.error);
  }, []);

  const refreshDownloads = useCallback(async () => {
    const res = await send<ExtensionDownload[]>({ type: 'downloads/list' });
    if (res.ok) setDownloads(res.data);
  }, []);

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
      const id = await currentTabId();
      setTabId(id);
      if (id !== undefined) await refreshTab(id);
      await refreshDownloads();
    })();
    const onMsg = (msg: unknown) => {
      const m = msg as { type?: string; tabId?: number; downloads?: ExtensionDownload[] };
      if (m.type === 'downloads/changed' && Array.isArray(m.downloads)) setDownloads(m.downloads);
      if (m.type === 'tab/changed' && m.tabId !== undefined) {
        setTabId((current) => {
          if (current !== undefined && current === m.tabId) void refreshTab(current);
          return current;
        });
        setScanning(false);
      }
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, [refreshTab, refreshDownloads]);

  const scanOnce = async () => {
    if (tabId === undefined) return;
    setScanning(true);
    const res = await send<null>({ type: 'tab/scan', tabId });
    if (!res.ok) {
      setScanning(false);
      setTabError(res.error);
      return;
    }
    // The content script reports back with tab/changed; stop waiting after 4 s.
    setTimeout(() => {
      setScanning(false);
      void refreshTab(tabId);
    }, 4000);
  };

  const enableSite = async () => {
    if (!tab?.origin || tabId === undefined) return;
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [`${tab.origin}/*`] });
    } catch {
      granted = false;
    }
    if (!granted) {
      setFlash({ tone: 'danger', text: 'Permission wasn’t granted, so Downora stays off for this site.' });
      return;
    }
    const res = await send<string[]>({ type: 'site/enabled', origin: tab.origin });
    if (!res.ok) return setFlash({ tone: 'danger', text: res.error });
    setFlash({ tone: 'success', text: `Downora is on for ${new URL(tab.origin).host}.` });
    await scanOnce();
  };

  const disableSite = async () => {
    if (!tab?.origin || tabId === undefined) return;
    await send({ type: 'site/disable', origin: tab.origin });
    setFlash({ tone: 'success', text: 'Downora is off for this site. Reload the page to remove its buttons.' });
    await refreshTab(tabId);
  };

  const download = async (source: DetectedSource, media: DetectedMedia) => {
    const res = await send<{ id: number }>({
      type: 'download/start',
      tabId,
      request: { url: source.src, title: media.title, container: source.container, kind: source.kind },
    });
    if (res.ok) {
      setFlash({ tone: 'success', text: 'Download started.' });
      setView('downloads');
      await refreshDownloads();
    } else setFlash({ tone: 'danger', text: res.error });
  };

  const openDashboard = (url?: string, kind: 'video' | 'audio' = 'video') =>
    void chrome.tabs.create({ url: dashboardLink(settings.dashboardUrl, url, kind) });

  const active = downloads.filter((d) => d.state === 'in_progress').length;

  return (
    <div className="relative flex min-h-[520px] flex-col overflow-hidden bg-canvas p-4 text-ink">
      <header className="relative flex items-center justify-between">
        <h1 className="m-0">
          <Logo className="[&_svg]:size-7 [&>span:last-child]:text-[1.0625rem]" />
        </h1>
        <Button variant="ghost" size="sm" onClick={() => openDashboard()}>
          <ExternalLink />
          Dashboard
        </Button>
      </header>

      <nav aria-label="Popup sections" className="relative mt-4">
        <SegmentedControl
          aria-label="Sections"
          className="grid grid-cols-3"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'page', label: 'This page' },
            { value: 'downloads', label: active ? `Downloads ${active}` : 'Downloads' },
            { value: 'settings', label: 'Settings' },
          ]}
        />
      </nav>

      {flash ? (
        <div className="mt-3">
          <Notice
            tone={flash.tone}
            icon={
              flash.tone === 'success' ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
              )
            }
          >
            <div className="flex items-start justify-between gap-2">
              <span>{flash.text}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setFlash(null)} className="hit-area text-ink-faint hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
          </Notice>
        </div>
      ) : null}

      <main className="relative flex-1">
        {view === 'page' ? (
          <PageView
            tab={tab}
            error={tabError}
            scanning={scanning}
            onScan={scanOnce}
            onEnable={enableSite}
            onDisable={disableSite}
            onDownload={download}
            onOpen={openDashboard}
          />
        ) : view === 'downloads' ? (
          <DownloadsView downloads={downloads} onChange={refreshDownloads} />
        ) : (
          <SettingsView settings={settings} onChange={setSettings} />
        )}
      </main>

      <footer className="mt-5 border-t border-line pt-3 text-center text-xs text-ink-faint">
        Downora never bypasses DRM or sign-ins.
      </footer>
    </div>
  );
}

// ───────────────────────── This page ─────────────────────────

function PageView({
  tab,
  error,
  scanning,
  onScan,
  onEnable,
  onDisable,
  onDownload,
  onOpen,
}: {
  tab: TabState | null;
  error?: string;
  scanning: boolean;
  onScan: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onDownload: (s: DetectedSource, m: DetectedMedia) => void;
  onOpen: (url?: string, kind?: 'video' | 'audio') => void;
}) {
  if (!tab && !error) {
    return (
      <div className="mt-5 flex flex-col gap-2" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-16 w-full rounded-panel" />
        <Skeleton className="h-24 w-full rounded-panel" />
      </div>
    );
  }
  if (!tab) {
    return (
      <div className="mt-5">
        <Notice tone="danger" icon={<AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />}>
          {error}
        </Notice>
      </div>
    );
  }
  const host = tab.origin ? new URL(tab.origin).host : '';

  return (
    <>
      <Section title="Current tab">
        <div className="rounded-panel border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-accent/15">
              {tab.access === 'restricted' ? <Lock className="size-4 text-accent-soft" /> : <Globe className="size-4 text-accent-soft" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{host || 'Browser page'}</p>
              <p className="text-xs text-ink-muted">
                {tab.access === 'enabled'
                  ? 'Detection is on for this site.'
                  : tab.access === 'off'
                    ? tab.origin
                      ? 'Detection is off for this site.'
                      : 'Detection is off. Open Downora from the toolbar on this page to scan it.'
                    : 'Chrome doesn’t let extensions read this page.'}
              </p>
            </div>
            <Badge tone={tab.access === 'enabled' ? 'success' : 'neutral'} dot>
              {tab.access === 'enabled' ? 'On' : tab.access === 'off' ? 'Off' : 'N/A'}
            </Badge>
          </div>
          {tab.access !== 'restricted' ? (
            <div className="mt-3 flex gap-2">
              {tab.access === 'off' ? (
                <>
                  {tab.origin ? (
                    <Button variant="primary" size="sm" className="flex-1" onClick={onEnable}>
                      Turn on for this site
                    </Button>
                  ) : null}
                  <Button size="sm" className="flex-1" onClick={onScan} loading={scanning}>
                    {scanning ? null : <ScanSearch />}
                    Scan once
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" className="flex-1" onClick={onScan} loading={scanning}>
                    {scanning ? null : <ScanSearch />}
                    Scan again
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onDisable}>
                    Turn off
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
        {error ? (
          <div className="mt-2">
            <Notice tone="danger" icon={<AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />}>
              {error}
            </Notice>
          </div>
        ) : null}
      </Section>

      {tab.access !== 'restricted' ? (
        <Section title={`Media on this page${tab.media.length ? ` (${tab.media.length})` : ''}`}>
          {scanning && !tab.media.length ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Scanning page">
              <Skeleton className="h-[72px] w-full rounded-panel" />
            </div>
          ) : !tab.scanned ? (
            <Notice>
              {tab.access === 'enabled'
                ? 'Waiting for the page. If it was open before you turned Downora on, reload it or press Scan again.'
                : 'Downora hasn’t looked at this page. Press Scan once, or turn it on so it checks automatically.'}
            </Notice>
          ) : tab.media.length === 0 ? (
            <Notice>
              No supported media found. Downora detects direct MP4, WebM, MP3, M4A and WAV files. Streams and DRM-protected
              video aren’t supported.
            </Notice>
          ) : (
            <ul className="overflow-hidden rounded-panel border border-line bg-surface" aria-label="Detected media">
              {tab.media.map((m) => (
                <MediaRow key={m.elementId} media={m} onDownload={onDownload} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </>
  );
}

function MediaRow({
  media,
  onDownload,
  onOpen,
}: {
  media: DetectedMedia;
  onDownload: (s: DetectedSource, m: DetectedMedia) => void;
  onOpen: (url?: string, kind?: 'video' | 'audio') => void;
}) {
  const [selected, setSelected] = useState(media.sources.find((s) => s.current)?.src ?? media.sources[0]!.src);
  const source = media.sources.find((s) => s.src === selected) ?? media.sources[0]!;
  const selectId = useId();
  const Icon = media.kind === 'audio' ? Music2 : Film;
  return (
    <li className="border-b border-line p-3.5 last:border-b-0" data-testid="popup-media">
      <div className="flex gap-3">
        <div className="grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded-[0.625rem] bg-raised">
          {media.poster ? (
            <img src={media.poster} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            <Icon className="size-5 text-ink-faint" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium break-words">{media.title}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {[media.kind === 'audio' ? 'Audio' : 'Video', formatDuration(media.durationSec), `${media.sources.length} file${media.sources.length > 1 ? 's' : ''}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Format for {media.title}
        </label>
        <select
          id={selectId}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-full border border-line bg-raised px-3 text-[0.8125rem] text-ink"
        >
          {media.sources.map((s) => (
            <option key={s.src} value={s.src}>
              {[s.container.toUpperCase(), qualityOf(s, media)].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>
        <Button variant="primary" size="sm" onClick={() => onDownload(source, media)} aria-label={`Download ${media.title}`}>
          <Download />
          Download
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Open ${media.title} in Downora`} onClick={() => onOpen(source.src, media.kind)}>
          <ExternalLink />
        </Button>
      </div>
    </li>
  );
}

// ───────────────────────── Downloads ─────────────────────────

function DownloadsView({ downloads, onChange }: { downloads: ExtensionDownload[]; onChange: () => void }) {
  if (downloads.length === 0) {
    return (
      <Section title="Recent downloads">
        <Notice>Files you save with Downora show up here with their progress.</Notice>
      </Section>
    );
  }
  const act = async (msg: PopupMessage) => {
    await send(msg);
    onChange();
  };
  return (
    <Section
      title="Recent downloads"
      action={
        downloads.some((d) => d.state !== 'in_progress') ? (
          <Button variant="link" size="sm" onClick={() => void act({ type: 'downloads/clear' })}>
            Clear finished
          </Button>
        ) : null
      }
    >
      <ul className="overflow-hidden rounded-panel border border-line bg-surface" aria-label="Recent downloads">
        {downloads.map((d) => {
          const fraction = d.bytesTotal ? d.bytesReceived / d.bytesTotal : null;
          return (
            <li key={d.id} className="border-b border-line p-3.5 last:border-b-0" data-testid="popup-download" data-state={d.state}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={d.fileName}>
                    {d.fileName}
                  </p>
                  <p className="text-xs text-ink-muted">{d.pageHost || new URL(d.url).host}</p>
                </div>
                <Badge tone={d.state === 'complete' ? 'success' : d.state === 'interrupted' ? 'danger' : 'accent'} dot>
                  {d.state === 'complete' ? 'Saved' : d.state === 'interrupted' ? 'Failed' : d.paused ? 'Paused' : 'Saving'}
                </Badge>
              </div>
              {d.state === 'in_progress' ? (
                <div className="mt-2.5">
                  <TransferTrack size="sm" label={`Progress for ${d.fileName}`} value={fraction} state={d.paused ? 'paused' : 'active'} />
                  <p className="mt-1.5 text-xs text-ink-muted tabular">
                    {formatBytes(d.bytesReceived) || '0 B'}
                    {d.bytesTotal ? ` of ${formatBytes(d.bytesTotal)}` : ''}
                  </p>
                </div>
              ) : d.state === 'interrupted' ? (
                <p className="mt-1.5 text-xs text-danger">{d.error ?? 'Chrome stopped the download.'}</p>
              ) : (
                <p className="mt-1.5 text-xs text-ink-muted tabular">{formatBytes(d.bytesTotal ?? d.bytesReceived)}</p>
              )}
              <div className="mt-2 flex gap-1.5">
                {d.state === 'in_progress' ? (
                  <Button size="sm" variant="ghost" onClick={() => void act({ type: 'downloads/cancel', id: d.id })}>
                    <X />
                    Cancel
                  </Button>
                ) : null}
                {d.state === 'interrupted' ? (
                  <Button size="sm" onClick={() => void act({ type: 'downloads/retry', id: d.id })}>
                    <RotateCcw />
                    Retry
                  </Button>
                ) : null}
                {d.state === 'complete' ? (
                  <Button size="sm" variant="ghost" onClick={() => void act({ type: 'downloads/show', id: d.id })}>
                    <FolderOpen />
                    Show in folder
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ───────────────────────── Settings ─────────────────────────

function SettingsView({ settings, onChange }: { settings: ExtensionSettings; onChange: (s: ExtensionSettings) => void }) {
  const [api, setApi] = useState<ApiStatus | null>(null);
  const [allSites, setAllSites] = useState(false);
  const [urls, setUrls] = useState({ dashboardUrl: settings.dashboardUrl, apiUrl: settings.apiUrl });
  const [apiGrant, setApiGrant] = useState(0);
  const fabId = useId();
  const saveAsId = useId();
  const allId = useId();
  const dashId = useId();
  const apiId = useId();

  useEffect(() => {
    void chrome.permissions.contains({ origins: ['https://*/*', 'http://*/*'] }).then(setAllSites);
  }, []);
  useEffect(() => {
    setApi(null);
    void checkApi(settings.apiUrl).then(setApi);
  }, [settings.apiUrl]);

  const update = async (patch: Partial<ExtensionSettings>) => onChange(await saveSettings(patch));

  const saveAddresses = async () => {
    // The worker can only reach the API if Chrome lets it; ask for that one origin.
    // Ask in the same click (a user gesture), but save first so a pending prompt can't block it.
    let origin: string | undefined;
    try {
      origin = urls.apiUrl ? new URL(urls.apiUrl).origin : undefined;
    } catch {
      /* bad URL: saveSettings falls back */
    }
    const asked = origin ? chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false) : null;
    await update(urls);
    if (asked && (await asked)) setApiGrant((n) => n + 1);
  };

  const toggleAllSites = async (next: boolean) => {
    if (next) {
      const granted = await chrome.permissions.request({ origins: ['https://*/*', 'http://*/*'] }).catch(() => false);
      if (!granted) return;
      await send({ type: 'site/enabled', origin: '*' });
    } else {
      await send({ type: 'site/disable', origin: '*' });
    }
    setAllSites(await chrome.permissions.contains({ origins: ['https://*/*', 'http://*/*'] }));
  };

  const row = 'flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0';
  return (
    <>
      <Section title="Appearance">
        <div className="flex items-center justify-between gap-4 rounded-panel border border-line bg-surface px-4 py-3">
          <span className="text-sm">Theme</span>
          <ThemeSwitcher size="sm" value={settings.theme} onChange={(theme) => void update({ theme })} />
        </div>
      </Section>

      <Section title="Behaviour">
        <div className="overflow-hidden rounded-panel border border-line bg-surface">
          <div className={row}>
            <label htmlFor={fabId} className="text-sm">
              Show button on videos
            </label>
            <Switch id={fabId} checked={settings.showFloatingButton} onCheckedChange={(v) => void update({ showFloatingButton: v })} />
          </div>
          <div className={row}>
            <label htmlFor={saveAsId} className="text-sm">
              Ask where to save each file
            </label>
            <Switch id={saveAsId} checked={settings.askWhereToSave} onCheckedChange={(v) => void update({ askWhereToSave: v })} />
          </div>
          <div className={row}>
            <div>
              <label htmlFor={allId} className="text-sm">
                Detect on all sites
              </label>
              <p className="text-xs text-ink-muted">Chrome will ask to let Downora read every site.</p>
            </div>
            <Switch id={allId} checked={allSites} onCheckedChange={(v) => void toggleAllSites(v)} />
          </div>
        </div>
      </Section>

      <Section title="Connections">
        <form
          className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveAddresses();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={dashId} className="text-sm">
              Downora web app address
            </label>
            <Input id={dashId} type="url" value={urls.dashboardUrl} onChange={(e) => setUrls((u) => ({ ...u, dashboardUrl: e.target.value }))} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={apiId} className="text-sm">
              Downora API address <span className="text-ink-faint">(optional)</span>
            </label>
            <Input id={apiId} type="url" placeholder="http://localhost:8787" value={urls.apiUrl} onChange={(e) => setUrls((u) => ({ ...u, apiUrl: e.target.value }))} className="h-10" />
          </div>
          <Button type="submit" size="sm" className="self-start">
            Save addresses
          </Button>
        </form>
      </Section>

      <Section title="Account">
        {api === null ? (
          <Notice>Checking…</Notice>
        ) : api.state === 'not_configured' ? (
          <Notice>No Downora API is set. Accounts and history sync need one. Everything else works without it.</Notice>
        ) : api.state === 'offline' ? (
          <Notice tone="danger">{api.message}</Notice>
        ) : !api.health.capabilities.auth ? (
          <Notice>This server doesn’t offer accounts, so history stays on this device.</Notice>
        ) : (
          <AccountPanel key={`${settings.apiUrl}#${apiGrant}`} dashboardUrl={settings.dashboardUrl} />
        )}
      </Section>
    </>
  );
}


function AccountPanel({ dashboardUrl }: { dashboardUrl: string }) {
  const [acct, setAcct] = useState<{ signedIn: boolean; email?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const emailId = useId();
  const passId = useId();

  useEffect(() => {
    void send<{ signedIn: boolean; email?: string }>({ type: 'account/state' }).then((r) => setAcct(r.ok ? r.data : { signedIn: false }));
  }, []);

  if (acct === null) return <Notice>Checking…</Notice>;
  if (acct.signedIn)
    return (
      <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
        <p className="text-sm">
          Signed in as <span className="font-semibold" data-testid="ext-account-email">{acct.email}</span>. Finished downloads are added to your history.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void chrome.tabs.create({ url: new URL('/history', dashboardUrl).href })}>
            <ExternalLink />
            View history
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await send({ type: 'account/signout' });
              setAcct({ signedIn: false });
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  return (
    <form
      className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError(undefined);
        const r = await send<{ signedIn: boolean; email?: string }>({ type: 'account/signin', email: String(f.get('email')), password: String(f.get('password')) });
        setBusy(false);
        if (r.ok) setAcct(r.data);
        else setError(r.error);
      }}
    >
      <p className="text-xs text-ink-muted">Use your Downora account. New here? Create one in the web app.</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm">Email</label>
        <Input id={emailId} name="email" type="email" autoComplete="email" required className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={passId} className="text-sm">Password</label>
        <Input id={passId} name="password" type="password" autoComplete="current-password" required minLength={10} className="h-10" />
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" size="sm" className="self-start" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
