/**
 * The in-browser download manager.
 *
 * Owns the actual transfers (AbortControllers and received bytes live here,
 * never in the persisted store) and schedules queued jobs up to the
 * concurrency limit from Settings. Every number the UI shows comes from the
 * bytes the browser really received.
 */
import { mimeForContainer } from '@downora/source-adapters';
import type { DownloadJob, MediaAnalysis, MediaFormat } from '@downora/types';
import { toast } from '@downora/ui';
import { getSettings } from '@/stores/settings';
import { useAccount } from '@/stores/account';
import { api } from '@/lib/api/client';
import { isActive, useDownloads } from '@/stores/downloads';
import { buildFileName } from '@/lib/format';
import { partialOf, runTransfer, TransferError } from './transfer';

interface Live {
  controller: AbortController;
  reason?: 'pause' | 'cancel';
  chunks: Uint8Array[];
  bytes: number;
}

const live = new Map<string, Live>();
/** Partial bytes kept for paused jobs. */
const parked = new Map<string, { chunks: Uint8Array[]; bytes: number }>();

function newId(): string {
  return crypto.randomUUID();
}

function store() {
  return useDownloads.getState();
}

function job(id: string): DownloadJob | undefined {
  return store().jobs.find((j) => j.id === id);
}

export function enqueueFromAnalysis(
  analysis: MediaAnalysis,
  format: MediaFormat,
  baseName: string,
): DownloadJob {
  const settings = getSettings();
  const next: DownloadJob = {
    id: newId(),
    sourceUrl: analysis.sourceUrl,
    sourceHost: analysis.sourceHost,
    adapterId: analysis.adapterId,
    kind: format.kind,
    title: analysis.title,
    fileName: buildFileName({
      baseName,
      container: format.container,
      qualityLabel: format.qualityLabel,
      pattern: settings.fileNamePattern,
    }),
    container: format.container,
    qualityLabel: format.qualityLabel,
    durationSec: analysis.durationSec,
    thumbnail: analysis.thumbnail,
    status: settings.autoStart ? 'queued' : 'paused',
    bytesReceived: 0,
    bytesTotal: format.sizeBytes,
    resumable: analysis.access.ranges ?? undefined,
    createdAt: new Date().toISOString(),
  };
  store().add(next);
  store().trimHistory(settings.historyLimit);
  pump();
  return next;
}

/** Starts queued jobs, oldest first, up to the concurrency limit. */
export function pump(): void {
  const { concurrency } = getSettings();
  const jobs = store().jobs;
  let running = jobs.filter((j) => j.status === 'downloading').length;
  const queued = jobs.filter((j) => j.status === 'queued').reverse();
  for (const next of queued) {
    if (running >= concurrency) break;
    running += 1;
    void transfer(next.id);
  }
}

async function transfer(id: string): Promise<void> {
  const current = job(id);
  if (!current || live.has(id)) return;

  const saved = parked.get(id);
  parked.delete(id);
  const controller = new AbortController();
  const entry: Live = { controller, chunks: saved?.chunks ?? [], bytes: saved?.bytes ?? 0 };
  live.set(id, entry);

  store().patch(id, {
    status: 'downloading',
    startedAt: current.startedAt ?? new Date().toISOString(),
    errorCode: undefined,
    errorMessage: undefined,
    bytesReceived: entry.bytes,
  });

  try {
    const result = await runTransfer({
      url: current.sourceUrl,
      existing: entry.chunks,
      existingBytes: entry.bytes,
      maxBytes: getSettings().maxBrowserFileMb * 1024 * 1024,
      signal: controller.signal,
      onProgress: (p) =>
        store().patch(id, {
          bytesReceived: p.bytesReceived,
          bytesTotal: p.bytesTotal,
          speedBps: p.speedBps,
          etaSec: p.etaSec,
        }),
    });

    const type = result.contentType?.split(';')[0] || mimeForContainer(current.container);
    saveBlob(new Blob(result.chunks as BlobPart[], { type }), current.fileName);
    store().patch(id, {
      status: 'completed',
      bytesReceived: result.bytesReceived,
      bytesTotal: result.bytesTotal,
      resumable: result.acceptsRanges,
      speedBps: undefined,
      etaSec: undefined,
      completedAt: new Date().toISOString(),
    });
    notifyComplete(current.fileName);
    // Signed in: keep account history in sync (best effort; local history is the source of truth here).
    if (useAccount.getState().status === 'signed_in') {
      void api
        .addHistory({
          url: current.sourceUrl,
          title: current.title,
          fileName: current.fileName,
          container: current.container,
          kind: current.kind,
          qualityLabel: current.qualityLabel,
          sizeBytes: result.bytesTotal,
          source: 'web',
        })
        .catch(() => {});
    }
  } catch (error) {
    const reason = entry.reason;
    const partial = partialOf(error);
    if (reason === 'pause') {
      const canResume = partial?.acceptsRanges ?? false;
      if (canResume && partial) parked.set(id, { chunks: partial.chunks, bytes: partial.bytesReceived });
      store().patch(id, {
        status: 'paused',
        resumable: canResume,
        bytesReceived: canResume && partial ? partial.bytesReceived : 0,
        speedBps: undefined,
        etaSec: undefined,
      });
    } else if (reason === 'cancel') {
      store().patch(id, { status: 'canceled', speedBps: undefined, etaSec: undefined });
    } else {
      const code = error instanceof TransferError ? error.code : 'network';
      const message =
        error instanceof TransferError
          ? error.message
          : current.sourceHost && !sameOrigin(current.sourceUrl)
            ? 'The server didn’t let the browser read this file. Use “Open file” to let your browser save it directly.'
            : 'The download stopped unexpectedly.';
      store().patch(id, {
        status: 'failed',
        errorCode: code === 'network' && !sameOrigin(current.sourceUrl) ? 'blocked' : code,
        errorMessage: message,
        speedBps: undefined,
        etaSec: undefined,
      });
    }
  } finally {
    live.delete(id);
    pump();
  }
}

function sameOrigin(url: string): boolean {
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

function saveBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start writing before releasing the memory.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

function notifyComplete(fileName: string): void {
  if (!getSettings().notifyOnComplete) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  new Notification('Download finished', { body: fileName, icon: '/favicon.svg' });
}

// ───────────────────────── Controls ─────────────────────────

export function pause(id: string): void {
  const entry = live.get(id);
  if (entry) {
    entry.reason = 'pause';
    entry.controller.abort();
  } else if (job(id)?.status === 'queued') {
    store().patch(id, { status: 'paused' });
  }
}

export function resume(id: string): void {
  const current = job(id);
  if (!current || (current.status !== 'paused' && current.status !== 'queued')) return;
  store().patch(id, { status: 'queued' });
  pump();
}

export function cancel(id: string): void {
  const entry = live.get(id);
  parked.delete(id);
  if (entry) {
    entry.reason = 'cancel';
    entry.controller.abort();
  } else if (job(id) && isActive(job(id)!)) {
    store().patch(id, { status: 'canceled', speedBps: undefined, etaSec: undefined });
  }
}

/** Starts a finished, failed or canceled job again from the beginning. */
export function retry(id: string): void {
  const current = job(id);
  if (!current || isActive(current)) return;
  parked.delete(id);
  store().patch(id, {
    status: 'queued',
    bytesReceived: 0,
    errorCode: undefined,
    errorMessage: undefined,
    completedAt: undefined,
    startedAt: undefined,
  });
  pump();
}

export function removeJob(id: string): void {
  cancel(id);
  parked.delete(id);
  store().remove(id);
}

export function isLive(id: string): boolean {
  return live.has(id);
}

// Resume the queue after a reload (queued jobs carry no bytes, so they're safe to start).
if (typeof window !== 'undefined') {
  queueMicrotask(() => {
    if (useDownloads.persist.hasHydrated()) pump();
    else useDownloads.persist.onFinishHydration(() => pump());
  });
}
