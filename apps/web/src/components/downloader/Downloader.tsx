/**
 * The downloader. Two analyses run side by side:
 * - in the browser: preview frame, playability, whether the file can be read here;
 * - on Downora's server (when connected): real stream info and the formats
 *   FFmpeg can produce from it.
 * Original files download in the browser with real progress. Conversions run
 * on the server for signed-in users and are then downloaded from there.
 */
import type { Container, MediaAnalysis, MediaFormat, MediaKind, ServerJob } from '@downora/types';
import { Button, cn, Panel, Skeleton, TransferTrack } from '@downora/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ExternalLink, Info, LogIn, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '@/lib/api/client';
import { AnalyzeError, analyzeUrl } from '@/lib/engine/analyze';
import { cancel, enqueueFromAnalysis, retry } from '@/lib/engine/manager';
import { canConvert, useAccount } from '@/stores/account';
import { useDownloads } from '@/stores/downloads';
import { DownloadButton, DownloadProgress, FormatSelector, MediaPreview, ModeToggle, QualitySelector, type ProgressView } from './parts';
import { URLInput } from './URLInput';

interface Result {
  /** What the UI shows. Server analysis when available, browser otherwise. */
  analysis: MediaAnalysis;
  /** Server media id, needed for server jobs. */
  serverId?: string;
  thumbnail?: string;
  playable: boolean;
  /** The browser can read the bytes itself (CORS allows it). */
  browserReadable: boolean;
  serverNote?: string;
}

type Phase =
  | { name: 'idle' }
  | { name: 'analyzing'; url: string }
  | { name: 'error'; url: string; message: string; hint?: string; inline: boolean }
  | { name: 'ready'; result: Result };

const ease = [0.22, 1, 0.36, 1] as const;

export interface DownloaderProps {
  kind?: MediaKind | 'any';
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  initialUrl?: string;
  /** Glass styling for the marketing page. */
  variant?: 'app' | 'stage';
}

export function Downloader({ kind = 'any', size = 'md', autoFocus, initialUrl, variant = 'app' }: DownloaderProps) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const init = useAccount((s) => s.init);

  const analyze = useCallback(
    async (input: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase({ name: 'analyzing', url: input });
      await init();
      const status = useAccount.getState().status;
      const serverAvailable = status === 'signed_in' || status === 'anonymous';
      const [browser, server] = await Promise.allSettled([
        analyzeUrl(input, controller.signal),
        // The server gets 10 s; if it's slower, the browser result is shown on its own.
        serverAvailable ? api.analyze(input, AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])) : Promise.reject(new ApiError(0, 'skip', '')),
      ]);
      if (controller.signal.aborted) return;
      if (browser.status === 'rejected' && server.status === 'rejected') {
        const e = browser.reason;
        if (e instanceof AnalyzeError) {
          setPhase({ name: 'error', url: input, message: e.message, hint: e.hint, inline: e.code === 'invalid_url' });
        } else setPhase({ name: 'error', url: input, message: 'Something went wrong while analyzing this link.', inline: false });
        return;
      }
      const b = browser.status === 'fulfilled' ? browser.value : undefined;
      const s = server.status === 'fulfilled' ? server.value : undefined;
      const serverNote =
        server.status === 'rejected' && server.reason instanceof ApiError && server.reason.code !== 'skip'
          ? `Downora’s server couldn’t read this link (${server.reason.message.replace(/\.$/, '')}), so only the original file is offered.`
          : undefined;
      const analysis: MediaAnalysis = s
        ? { ...s, title: b?.title ?? s.title, durationSec: s.durationSec ?? b?.durationSec, width: s.width ?? b?.width, height: s.height ?? b?.height }
        : b!;
      setPhase({
        name: 'ready',
        result: {
          analysis,
          serverId: s?.id,
          thumbnail: b?.thumbnail,
          playable: b?.playable ?? false,
          browserReadable: b?.access.transfer === 'direct',
          serverNote,
        },
      });
    },
    [init],
  );

  useEffect(() => {
    if (initialUrl) void analyze(initialUrl);
    return () => abortRef.current?.abort();
  }, [initialUrl, analyze]);

  const stage = variant === 'stage';
  return (
    <div className="flex flex-col gap-5">
      <URLInput
        value={url}
        onChange={setUrl}
        onSubmit={analyze}
        busy={phase.name === 'analyzing'}
        error={phase.name === 'error' && phase.inline ? phase.message : undefined}
        kind={kind}
        size={size}
        autoFocus={autoFocus}
      />
      <div aria-live="polite" aria-busy={phase.name === 'analyzing'}>
        <AnimatePresence mode="wait" initial={false}>
          {phase.name === 'analyzing' ? (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Panel className="p-5">
                <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <Skeleton className="aspect-video rounded-[1.25rem]" />
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-ink-muted">Reading the file’s details…</p>
                    <TransferTrack label="Analyzing link" value={null} size="sm" />
                    <Skeleton className="mt-2 h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              </Panel>
            </motion.div>
          ) : phase.name === 'error' && !phase.inline ? (
            <motion.div key="error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Panel role="alert" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-danger/12">
                  <AlertTriangle className="size-5 text-danger" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{phase.message}</p>
                  {phase.hint ? <p className="mt-1 text-sm text-ink-muted">{phase.hint}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => analyze(phase.url)}>
                      <RotateCcw /> Try again
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/sources">See supported sources</Link>
                    </Button>
                  </div>
                </div>
              </Panel>
            </motion.div>
          ) : phase.name === 'ready' ? (
            <motion.div key={phase.result.analysis.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }}>
              <ResultView
                result={phase.result}
                stage={stage}
                onReset={() => {
                  setUrl('');
                  setPhase({ name: 'idle' });
                }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ───────────────────────── result ─────────────────────────

type Active = { type: 'browser'; jobId: string } | { type: 'server'; job: ServerJob };

function ResultView({ result, stage, onReset }: { result: Result; stage: boolean; onReset: () => void }) {
  const { analysis } = result;
  const status = useAccount((s) => s.status);
  const health = useAccount((s) => s.health);
  const convert = canConvert({ status, health });
  const formats = analysis.formats;
  const original = formats[0]!;
  const available = { video: formats.some((f) => f.kind === 'video'), audio: formats.some((f) => f.kind === 'audio') };
  const [mode, setMode] = useState<MediaKind>(original.kind);
  const inMode = useMemo(() => formats.filter((f) => f.kind === mode), [formats, mode]);
  const [container, setContainer] = useState<Container>(original.container);
  const inContainer = inMode.filter((f) => f.container === container);
  const [formatId, setFormatId] = useState(original.id);
  const format: MediaFormat = inContainer.find((f) => f.id === formatId) ?? inContainer[0] ?? inMode[0] ?? original;
  const [active, setActive] = useState<Active | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const pickMode = (k: MediaKind) => {
    setMode(k);
    const first = formats.find((f) => f.kind === k);
    if (first) {
      setContainer(first.container);
      setFormatId(first.id);
    }
  };
  const pickContainer = (c: Container) => {
    setContainer(c);
    const best = [...inMode.filter((f) => f.container === c)].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    if (best) setFormatId(best.id);
  };

  // Which path will this download take, and is it allowed?
  const needsServer = format.delivery === 'transcode' || !result.browserReadable;
  const locked = needsServer && !(status === 'signed_in' && result.serverId && (format.delivery === 'original' || convert));

  const start = async () => {
    setError(undefined);
    if (!needsServer) {
      const job = enqueueFromAnalysis({ ...analysis, thumbnail: result.thumbnail, access: { ...analysis.access, transfer: 'direct' } }, format, analysis.baseName);
      setActive({ type: 'browser', jobId: job.id });
      return;
    }
    setBusy(true);
    try {
      setActive({ type: 'server', job: await api.createJob(result.serverId!, format.id) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t start the job.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className={cn('overflow-hidden bg-raised/60', stage && 'shadow-panel')} data-testid="media-stage">
      <div className="p-4 sm:p-6">
        <MediaPreview analysis={analysis} thumbnail={result.thumbnail} playable={result.playable} />
      </div>
      <div className="px-4 pb-5 sm:px-6 sm:pb-6">
        {active ? (
          <ActiveProgress active={active} onUpdate={setActive} onReset={onReset} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex min-w-0 flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <ModeToggle value={mode} onChange={pickMode} available={available} />
                {!available.audio && analysis.kind === 'video' ? <span className="px-4 text-[0.8125rem] text-ink-muted">Audio only needs Downora’s server.</span> : null}
              </div>
              <div className={cn('grid gap-6', mode === 'video' && inContainer.length > 0 && 'md:grid-cols-2')}>
                <div>
                  <p className="mb-1.5 px-4 text-[0.8125rem] text-ink-muted">Format</p>
                  <FormatSelector formats={inMode} value={format.container} onChange={pickContainer} />
                </div>
                {mode === 'video' && inContainer.length > 0 ? (
                  <div>
                    <p className="mb-1.5 px-4 text-[0.8125rem] text-ink-muted">Quality</p>
                    <QualitySelector formats={inContainer} value={format.id} onChange={setFormatId} />
                  </div>
                ) : null}
              </div>
              <p className="-mt-4 px-4 text-[0.8125rem] leading-[1.125rem] text-ink-muted">
                {result.serverNote ??
                  (result.serverId
                    ? 'Only what this file really offers is listed. Qualities never go above the source.'
                    : status === 'not_configured' || status === 'offline'
                      ? 'Downora’s server isn’t connected, so only the original file is offered. Conversions need the server.'
                      : 'Only the original file is offered for this link.')}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {locked ? (
                <div className="flex gap-2.5 rounded-panel bg-cell p-4 text-[0.9375rem]">
                  <Info className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden />
                  <p className="text-ink-muted">
                    {!result.browserReadable && format.delivery === 'original' ? 'This server doesn’t let browsers read the file directly. ' : 'Converting runs on Downora’s server. '}
                    {status === 'signed_in' ? 'It isn’t available for this link.' : status === 'anonymous' ? 'Sign in to use it.' : 'The server isn’t connected right now.'}
                  </p>
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <DownloadButton format={format} onClick={() => void start()} busy={busy} locked={locked ? 'locked' : undefined} />
              {locked && !result.browserReadable && format.delivery === 'original' ? (
                <Button variant="ghost" asChild>
                  <a href={analysis.sourceUrl} target="_blank" rel="noreferrer noopener">
                    <ExternalLink /> Open the file in a new tab instead
                  </a>
                </Button>
              ) : null}
              {locked && status === 'anonymous' ? (
                <Button variant="secondary" asChild>
                  <Link to="/sign-in">
                    <LogIn /> Sign in to convert
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ActiveProgress({ active, onUpdate, onReset }: { active: Active; onUpdate: (a: Active) => void; onReset: () => void }) {
  const browserJob = useDownloads((s) => (active.type === 'browser' ? s.jobs.find((j) => j.id === active.jobId) : undefined));
  const saved = useRef(false);

  // Poll the server job, then hand the finished file to the browser once.
  useEffect(() => {
    if (active.type !== 'server') return;
    const j = active.job;
    if (j.status === 'completed') {
      if (!saved.current) {
        saved.current = true;
        const a = document.createElement('a');
        a.href = api.fileUrl(j.id);
        a.download = j.fileName;
        a.rel = 'noopener';
        document.body.append(a);
        a.click();
        a.remove();
      }
      return;
    }
    if (j.status === 'failed' || j.status === 'canceled') return;
    const t = setTimeout(() => {
      api.job(j.id).then((next) => onUpdate({ type: 'server', job: next }), () => {});
    }, 500);
    return () => clearTimeout(t);
  }, [active, onUpdate]);

  let view: ProgressView;
  if (active.type === 'browser') {
    if (!browserJob) return null;
    view = {
      phase: browserJob.status,
      fileName: browserJob.fileName,
      fraction: browserJob.status === 'completed' ? 1 : browserJob.bytesTotal ? browserJob.bytesReceived / browserJob.bytesTotal : null,
      bytes: browserJob.bytesReceived,
      total: browserJob.bytesTotal,
      speed: browserJob.speedBps,
      eta: browserJob.etaSec,
      error: browserJob.errorMessage,
    };
  } else {
    const j = active.job;
    view = {
      phase: j.status,
      fileName: j.fileName,
      fraction: j.status === 'converting' ? (j.convertProgress ?? null) : j.status === 'completed' ? 1 : j.bytesTotal ? j.bytesReceived / j.bytesTotal : null,
      bytes: j.status === 'downloading' ? j.bytesReceived : j.sizeBytes,
      total: j.status === 'downloading' ? j.bytesTotal : undefined,
      error: j.error,
      savedNote: j.status === 'completed' ? 'Converted on Downora’s server and sent to your downloads folder. The server copy is deleted within an hour.' : undefined,
    };
  }

  const cancelable = view.phase === 'downloading' || view.phase === 'queued' || view.phase === 'converting';
  return (
    <DownloadProgress
      view={view}
      onReset={onReset}
      onCancel={
        cancelable
          ? () => {
              if (active.type === 'browser') cancel(active.jobId);
              else void api.cancelJob(active.job.id).then(() => onUpdate({ type: 'server', job: { ...active.job, status: 'canceled' } }));
            }
          : undefined
      }
      onRetry={active.type === 'browser' && (view.phase === 'failed' || view.phase === 'canceled') ? () => retry(active.jobId) : undefined}
    />
  );
}
