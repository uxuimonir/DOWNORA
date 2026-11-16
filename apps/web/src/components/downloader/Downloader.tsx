import { CONTAINERS, type MediaAnalysis, type MediaFormat, type MediaKind } from '@downora/types';
import { Badge, Button, cn, Input, Label, Panel, Skeleton, TransferTrack } from '@downora/ui';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Film,
  Info,
  ListOrdered,
  Music2,
  Play,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnalyzeError, analyzeUrl } from '@/lib/engine/analyze';
import { cancel, enqueueFromAnalysis, retry } from '@/lib/engine/manager';
import { formatBytes, formatDuration, formatEta, formatSpeed } from '@/lib/format';
import { useDownloads } from '@/stores/downloads';
import { UrlBar } from './UrlBar';

type Phase =
  | { name: 'idle' }
  | { name: 'analyzing'; url: string }
  | { name: 'error'; url: string; message: string; hint?: string; inline: boolean }
  | { name: 'ready'; analysis: MediaAnalysis };

export interface DownloaderProps {
  kind?: MediaKind | 'any';
  size?: 'md' | 'lg';
  autoFocus?: boolean;
  initialUrl?: string;
}

export function Downloader({ kind = 'any', size = 'md', autoFocus, initialUrl }: DownloaderProps) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (input: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: 'analyzing', url: input });
    try {
      const analysis = await analyzeUrl(input, controller.signal);
      if (!controller.signal.aborted) setPhase({ name: 'ready', analysis });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof AnalyzeError) {
        setPhase({
          name: 'error',
          url: input,
          message: error.message,
          hint: error.hint,
          inline: error.code === 'invalid_url',
        });
      } else {
        setPhase({ name: 'error', url: input, message: 'Something went wrong while analyzing this link.', inline: false });
      }
    }
  }, []);

  useEffect(() => {
    if (initialUrl) void analyze(initialUrl);
    return () => abortRef.current?.abort();
  }, [initialUrl, analyze]);

  return (
    <div className="flex flex-col gap-5">
      <UrlBar
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
              <AnalyzingState url={phase.url} />
            </motion.div>
          ) : phase.name === 'error' && !phase.inline ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ErrorState message={phase.message} hint={phase.hint} onRetry={() => analyze(phase.url)} />
            </motion.div>
          ) : phase.name === 'ready' ? (
            <motion.div
              key={phase.analysis.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <MediaStage
                analysis={phase.analysis}
                pageKind={kind}
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

// ───────────────────────── States ─────────────────────────

function AnalyzingState({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url.includes('://') ? url : `https://${url}`).host;
  } catch {
    /* keep raw */
  }
  return (
    <Panel className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Skeleton className="aspect-video rounded-none md:rounded-l-panel" />
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-ink-muted">
            Reading file details from <span className="text-ink">{host}</span>
          </p>
          <TransferTrack label="Analyzing link" value={null} size="sm" />
          <Skeleton className="mt-2 h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-4 h-14 w-full" />
        </div>
      </div>
    </Panel>
  );
}

function ErrorState({ message, hint, onRetry }: { message: string; hint?: string; onRetry: () => void }) {
  return (
    <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start" role="alert">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger/12">
        <AlertTriangle className="size-5 text-danger" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{message}</p>
        {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onRetry}>
            <RotateCcw />
            Try again
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/sources">See supported sources</Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}

// ───────────────────────── Media stage ─────────────────────────

function MediaStage({
  analysis,
  pageKind,
  onReset,
}: {
  analysis: MediaAnalysis;
  pageKind: MediaKind | 'any';
  onReset: () => void;
}) {
  const [formatId, setFormatId] = useState(analysis.formats[0]?.id ?? '');
  const [baseName, setBaseName] = useState(analysis.baseName);
  const [jobId, setJobId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const nameId = useId();
  const format = analysis.formats.find((f) => f.id === formatId) ?? analysis.formats[0];
  const job = useDownloads((s) => (jobId ? s.jobs.find((j) => j.id === jobId) : undefined));
  const blocked = analysis.access.transfer === 'blocked';
  const KindIcon = analysis.kind === 'audio' ? Music2 : Film;

  const conversions = CONTAINERS.filter((c) =>
    analysis.kind === 'audio' ? ['mp3', 'wav', 'm4a'].includes(c) : true,
  ).filter((c) => c !== format?.container);

  const readout: [string, string][] = [
    ['Source', analysis.sourceHost],
    ['Type', `${analysis.kind === 'video' ? 'Video' : 'Audio'}, ${format?.container.toUpperCase()}`],
    ['Duration', formatDuration(analysis.durationSec)],
  ];
  if (analysis.kind === 'video') {
    readout.push([
      'Resolution',
      analysis.width && analysis.height ? `${analysis.width} × ${analysis.height}` : 'Not reported',
    ]);
  }
  readout.push(['Size', analysis.sizeBytes ? formatBytes(analysis.sizeBytes) : 'Not reported by the server']);

  return (
    <Panel className="overflow-hidden" data-testid="media-stage">
      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Preview */}
        <div className="relative border-b border-line bg-canvas md:border-r md:border-b-0">
          {playing && analysis.playable ? (
            analysis.kind === 'video' ? (
              <video src={analysis.sourceUrl} controls autoPlay className="aspect-video w-full bg-black" />
            ) : (
              <div className="grid aspect-video place-items-center p-6">
                <audio src={analysis.sourceUrl} controls autoPlay className="w-full" />
              </div>
            )
          ) : (
            <div className="relative aspect-video w-full overflow-hidden">
              {analysis.thumbnail ? (
                <img src={analysis.thumbnail} alt={`Preview frame of ${analysis.title}`} className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center bg-[radial-gradient(120%_90%_at_20%_0%,rgb(243_100_68/0.22),transparent_60%),radial-gradient(100%_80%_at_100%_100%,rgb(255_255_255/0.04),transparent_60%)]">
                  <KindIcon className="size-10 text-ink-faint" aria-hidden />
                </div>
              )}
              {analysis.playable ? (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  className="absolute inset-0 grid place-items-center bg-black/0 transition-colors hover:bg-black/25"
                  aria-label={`Play preview of ${analysis.title}`}
                >
                  <span className="grid size-14 place-items-center rounded-full border border-white/20 bg-canvas/70 backdrop-blur-sm">
                    <Play className="ml-0.5 size-6 fill-current text-white" aria-hidden />
                  </span>
                </button>
              ) : null}
              {format?.qualityLabel ? (
                <span className="absolute top-3 left-3 rounded-md bg-canvas/80 px-2 py-1 text-xs font-semibold text-ink backdrop-blur-sm">
                  {format.qualityLabel}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-lg font-semibold tracking-[-0.015em] break-words ">
              {analysis.title}
            </h2>
            <Badge tone="success" className="mt-0.5">
              <ShieldCheck />
              Direct file
            </Badge>
          </div>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            {readout.map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-ink-faint">{term}</dt>
                <dd className="tabular min-w-0 truncate text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {pageKind !== 'any' && pageKind !== analysis.kind ? (
            <p className="mt-4 flex gap-2 rounded-control border border-info/25 bg-info/8 px-3 py-2 text-sm text-ink-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
              <span>
                This link is {analysis.kind === 'audio' ? 'an audio' : 'a video'} file. You can still save it here, or use the{' '}
                <Link className="text-info underline-offset-2 hover:underline" to={analysis.kind === 'audio' ? '/audio' : '/video'}>
                  {analysis.kind} downloader
                </Link>
                .
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {/* Format + action */}
      <div className="border-t border-line p-5">
        {job ? (
          <JobProgress jobId={job.id} onReset={onReset} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end">
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-medium">Available formats</legend>
              <div className="flex flex-col gap-2">
                {analysis.formats.map((f) => (
                  <FormatOption key={f.id} format={f} checked={f.id === formatId} onSelect={() => setFormatId(f.id)} />
                ))}
              </div>
              {conversions.length ? (
                <p className="mt-2.5 text-xs leading-relaxed text-ink-faint">
                  Converting to {conversions.map((c) => c.toUpperCase()).join(', ')} needs the Downora media service,
                  which isn’t connected yet. Only formats this file actually offers are listed.
                </p>
              ) : null}
            </fieldset>

            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor={nameId}>File name</Label>
                <div className="mt-2 flex items-center rounded-control border border-line-strong bg-canvas focus-within:border-accent">
                  <Input
                    id={nameId}
                    value={baseName}
                    onChange={(e) => setBaseName(e.target.value)}
                    className="border-0 bg-transparent focus-visible:ring-0"
                  />
                  <span className="pr-3 text-sm text-ink-faint">.{format?.container}</span>
                </div>
              </div>
              {blocked ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs leading-relaxed text-ink-muted">
                    This server doesn’t allow other sites to read the file, so the in-browser engine can’t save it with
                    progress. Your browser can still open and save it directly.
                  </p>
                  <Button variant="primary" size="lg" asChild>
                    <a href={analysis.sourceUrl} target="_blank" rel="noreferrer noopener">
                      <ExternalLink />
                      Open file in a new tab
                    </a>
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!format || !baseName.trim()}
                  onClick={() => {
                    if (!format) return;
                    const created = enqueueFromAnalysis(analysis, format, baseName.trim());
                    setJobId(created.id);
                  }}
                >
                  <Download />
                  Download {format?.container.toUpperCase()}
                  {format?.sizeBytes ? <span className="tabular font-normal text-white/75">{formatBytes(format.sizeBytes)}</span> : null}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function FormatOption({ format, checked, onSelect }: { format: MediaFormat; checked: boolean; onSelect: () => void }) {
  const id = useId();
  const details = [
    format.width && format.height ? `${format.width} × ${format.height}` : null,
    format.delivery === 'original' ? 'Original file, unchanged' : 'Converted',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center gap-3 rounded-control border px-3.5 py-3 transition-colors',
        checked ? 'border-accent/70 bg-accent/8' : 'border-line-strong hover:border-[#3a3a3a]',
      )}
    >
      <input
        id={id}
        type="radio"
        name="format"
        checked={checked}
        onChange={onSelect}
        className="size-4 accent-[var(--color-accent)]"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold text-ink">
          {format.container.toUpperCase()}
          {format.qualityLabel ? <span className="ml-2 font-medium text-accent-soft">{format.qualityLabel}</span> : null}
        </span>
        <span className="truncate text-xs text-ink-muted">{details}</span>
      </span>
      <span className="tabular text-sm text-ink-muted">{format.sizeBytes ? formatBytes(format.sizeBytes) : 'Size unknown'}</span>
    </label>
  );
}

function JobProgress({ jobId, onReset }: { jobId: string; onReset: () => void }) {
  const job = useDownloads((s) => s.jobs.find((j) => j.id === jobId));
  if (!job) return null;

  const fraction = job.bytesTotal ? job.bytesReceived / job.bytesTotal : null;
  const percent = fraction !== null ? Math.floor(fraction * 100) : null;

  if (job.status === 'completed') {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center" data-testid="download-complete">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success/12">
          <CheckCircle2 className="size-6 text-success" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink" role="status">
            Saved {job.fileName}
          </p>
          <p className="tabular text-sm text-ink-muted">
            {formatBytes(job.bytesTotal ?? job.bytesReceived)} saved to your browser’s downloads folder.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onReset}>Download another</Button>
          <Button variant="ghost" asChild>
            <Link to="/history">View history</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (job.status === 'failed' || job.status === 'canceled') {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center" role="alert">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-danger/12">
          <AlertTriangle className="size-5 text-danger" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{job.status === 'canceled' ? 'Download canceled' : 'Download failed'}</p>
          {job.errorMessage ? <p className="text-sm text-ink-muted">{job.errorMessage}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => retry(job.id)}>
            <RotateCcw />
            Retry
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Start over
          </Button>
        </div>
      </div>
    );
  }

  const eta = formatEta(job.etaSec);
  return (
    <div className="flex flex-col gap-3" data-testid="download-progress">
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 truncate text-sm font-medium">
          {job.status === 'queued' ? 'Waiting for a free slot' : job.status === 'paused' ? 'Paused' : 'Downloading'}{' '}
          <span className="text-ink-muted">{job.fileName}</span>
        </p>
        <span className="tabular text-[1.75rem] leading-none font-light tracking-[-0.04em]">{percent !== null ? `${percent}%` : formatBytes(job.bytesReceived)}</span>
      </div>
      <TransferTrack
        label={`Progress for ${job.fileName}`}
        value={fraction}
        state={job.status === 'paused' ? 'paused' : job.status === 'queued' ? 'idle' : 'active'}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tabular text-xs text-ink-muted">
          {formatBytes(job.bytesReceived)}
          {job.bytesTotal ? ` of ${formatBytes(job.bytesTotal)}` : ''}
          {job.speedBps ? `, ${formatSpeed(job.speedBps)}` : ''}
          {eta ? `, ${eta}` : ''}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link to="/queue">
              <ListOrdered />
              Open queue
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => cancel(job.id)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
