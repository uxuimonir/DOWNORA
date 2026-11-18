/**
 * The building blocks of the downloader. Each is presentational: it shows
 * what it's given and reports choices; Downloader.tsx owns the data.
 */
import type { Container, MediaAnalysis, MediaFormat, MediaKind } from '@downora/types';
import { Badge, Button, cn, listGroupClass, SegmentedControl, TransferTrack } from '@downora/ui';
import { ToggleGroup } from 'radix-ui';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, CheckCircle2, Download, Film, LoaderCircle, Lock, Music2, Play, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatBytes, formatDuration, formatEta, formatSpeed } from '@/lib/format';

// ───────────────────────── MediaPreview ─────────────────────────

export function MediaPreview({ analysis, thumbnail, playable }: { analysis: MediaAnalysis; thumbnail?: string; playable: boolean }) {
  const [playing, setPlaying] = useState(false);
  const Icon = analysis.kind === 'audio' ? Music2 : Film;
  const rows: [string, string][] = [
    ['Source', analysis.sourceHost],
    ['Type', `${analysis.kind === 'video' ? 'Video' : 'Audio'}, ${analysis.formats[0]?.container.toUpperCase()}`],
    ['Duration', formatDuration(analysis.durationSec)],
  ];
  if (analysis.kind === 'video') rows.push(['Resolution', analysis.width && analysis.height ? `${analysis.width} × ${analysis.height}` : 'Not reported']);
  rows.push(['Size', analysis.sizeBytes ? formatBytes(analysis.sizeBytes) : 'Not reported by the server']);

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" data-testid="media-preview">
      <div className="relative aspect-video overflow-hidden rounded-panel bg-cell">
        {playing && playable ? (
          analysis.kind === 'video' ? (
            <video src={analysis.sourceUrl} controls autoPlay className="size-full bg-black object-contain" />
          ) : (
            <div className="grid size-full place-items-center p-6">
              <audio src={analysis.sourceUrl} controls autoPlay className="w-full" />
            </div>
          )
        ) : (
          <>
            {thumbnail ? (
              <img src={thumbnail} alt={`Preview frame of ${analysis.title}`} className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center bg-cell">
                <Icon className="size-10 text-ink-muted" aria-hidden />
              </div>
            )}
            {playable ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="group absolute inset-0 grid place-items-center"
                aria-label={`Play preview of ${analysis.title}`}
              >
                <span className="material grid size-16 place-items-center rounded-full ring-1 ring-edge transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
                  <Play className="ml-0.5 size-6 fill-current text-ink" aria-hidden />
                </span>
              </button>
            ) : null}
            {analysis.formats[0]?.qualityLabel ? (
              <span className="material absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-edge">
                {analysis.formats[0].qualityLabel}
              </span>
            ) : null}
          </>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-[1.375rem] leading-7 font-bold tracking-[-0.02em] break-words">{analysis.title}</h3>
          <Badge tone="success" className="mt-1">
            <ShieldCheck /> Direct file
          </Badge>
        </div>
        <dl className={cn(listGroupClass, 'mt-4')}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex min-h-11 items-center justify-between gap-4 px-4 py-2.5 text-[0.9375rem]">
              <dt className="text-ink">{k}</dt>
              <dd className="tabular min-w-0 truncate text-right text-ink-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ───────────────────────── Selectors ─────────────────────────

interface ChipOption {
  value: string;
  label: ReactNode;
  hint?: string;
  disabled?: boolean;
}

/** iOS checkmark list: one row per option, arrow keys move between rows (Radix ToggleGroup). */
function ChoiceList({ label, value, onChange, options, testId }: { label: string; value: string; onChange: (v: string) => void; options: ChipOption[]; testId?: string }) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className={cn(listGroupClass, 'flex flex-col')}
      data-testid={testId}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            'group flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
            'hover:bg-fill/50 active:bg-fill disabled:cursor-not-allowed disabled:opacity-40 focus-visible:z-10',
          )}
        >
          <span className="flex-1 text-[1.0625rem] tracking-[-0.01em] text-ink group-data-[state=on]:font-semibold">{o.label}</span>
          {o.hint ? <span className="tabular text-[0.9375rem] text-ink-muted">{o.hint}</span> : null}
          <Check className="size-[18px] shrink-0 text-accent-soft opacity-0 group-data-[state=on]:opacity-100" strokeWidth={2.6} aria-hidden />
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

export function ModeToggle({ value, onChange, available }: { value: MediaKind; onChange: (k: MediaKind) => void; available: Record<MediaKind, boolean> }) {
  return (
    <SegmentedControl<MediaKind>
      className="grid w-full grid-cols-2"
      aria-label="Video or audio"
      value={value}
      onValueChange={(v) => available[v] && onChange(v)}
      options={[
        { value: 'video', label: <><Film aria-hidden /> Video</>, ariaLabel: available.video ? 'Video' : 'Video (not available for this file)' },
        { value: 'audio', label: <><Music2 aria-hidden /> Audio</>, ariaLabel: available.audio ? 'Audio' : 'Audio (not available for this file)' },
      ]}
    />
  );
}

export function FormatSelector({ formats, value, onChange }: { formats: MediaFormat[]; value: Container; onChange: (c: Container) => void }) {
  const containers = [...new Set(formats.map((f) => f.container))];
  return (
    <ChoiceList
      label="Format"
      testId="format-selector"
      value={value}
      onChange={(v) => onChange(v as Container)}
      options={containers.map((c) => {
        const original = formats.some((f) => f.container === c && f.delivery === 'original');
        return { value: c, label: c.toUpperCase(), hint: original ? 'Original file' : 'Converted' };
      })}
    />
  );
}

export function QualitySelector({ formats, value, onChange }: { formats: MediaFormat[]; value: string; onChange: (formatId: string) => void }) {
  const sorted = [...formats].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return (
    <ChoiceList
      label="Quality"
      testId="quality-selector"
      value={value}
      onChange={onChange}
      options={sorted.map((f) => ({
        value: f.id,
        label: f.qualityLabel ?? 'Source quality',
        hint: f.sizeBytes ? formatBytes(f.sizeBytes) : f.delivery === 'original' ? 'Original' : 'Converted',
      }))}
    />
  );
}

// ───────────────────────── DownloadButton ─────────────────────────

export function DownloadButton({ format, onClick, busy, locked }: { format: MediaFormat; onClick: () => void; busy?: boolean; locked?: string }) {
  return (
    <motion.div whileTap={{ scale: 0.98 }} className="w-full">
      <Button variant="primary" size="lg" className="h-[3.25rem] w-full rounded-[0.875rem] text-[1.0625rem]" onClick={onClick} loading={busy} disabled={Boolean(locked)}>
        {busy ? null : locked ? <Lock /> : <Download />}
        {format.delivery === 'transcode' ? 'Convert & download' : 'Download'} {format.container.toUpperCase()}
        {format.qualityLabel && format.kind === 'video' ? <span className="font-normal opacity-70">{format.qualityLabel}</span> : null}
        {format.sizeBytes ? <span className="tabular font-normal opacity-70">{formatBytes(format.sizeBytes)}</span> : null}
      </Button>
    </motion.div>
  );
}

// ───────────────────────── DownloadProgress ─────────────────────────

export interface ProgressView {
  phase: 'queued' | 'downloading' | 'converting' | 'paused' | 'completed' | 'failed' | 'canceled';
  fileName: string;
  fraction: number | null;
  bytes?: number;
  total?: number;
  speed?: number;
  eta?: number;
  error?: string;
  /** Where the file went, for the success message. */
  savedNote?: string;
}

export function DownloadProgress({ view, onCancel, onRetry, onReset }: { view: ProgressView; onCancel?: () => void; onRetry?: () => void; onReset: () => void }) {
  if (view.phase === 'completed') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="flex flex-col gap-4 sm:flex-row sm:items-center" data-testid="download-complete">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-success/15">
          <CheckCircle2 className="size-6 text-success" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold" role="status">
            Saved {view.fileName}
          </p>
          <p className="tabular text-sm text-ink-muted">{view.savedNote ?? `${formatBytes(view.total ?? view.bytes)} saved to your downloads folder.`}</p>
        </div>
        <Button onClick={onReset}>Download another</Button>
      </motion.div>
    );
  }
  if (view.phase === 'failed' || view.phase === 'canceled') {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center" role="alert">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-danger/12">
          <AlertTriangle className="size-5 text-danger" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{view.phase === 'canceled' ? 'Download canceled' : 'Download failed'}</p>
          {view.error ? <p className="text-sm text-ink-muted">{view.error}</p> : null}
        </div>
        <div className="flex gap-2">
          {onRetry ? (
            <Button onClick={onRetry}>
              <RotateCcw /> Retry
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onReset}>
            Start over
          </Button>
        </div>
      </div>
    );
  }
  const pct = view.fraction != null ? Math.floor(view.fraction * 100) : null;
  const label =
    view.phase === 'converting' ? 'Converting on Downora’s server' : view.phase === 'queued' ? 'Waiting to start' : view.phase === 'paused' ? 'Paused' : 'Downloading';
  return (
    <div className="flex flex-col gap-3" data-testid="download-progress">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {view.phase === 'converting' || view.phase === 'queued' ? <LoaderCircle className="size-4 animate-spin text-accent-soft" aria-hidden /> : null}
            {label}
          </p>
          <p className="truncate text-sm text-ink-muted">{view.fileName}</p>
        </div>
        <span className="tabular text-4xl leading-none font-light tracking-[-0.04em]">{pct != null ? `${pct}%` : ''}</span>
      </div>
      <TransferTrack label={`${label}: ${view.fileName}`} value={view.fraction} state={view.phase === 'paused' ? 'paused' : view.phase === 'queued' ? 'idle' : 'active'} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tabular text-xs text-ink-muted">
          {view.bytes != null ? `${formatBytes(view.bytes)}${view.total ? ` of ${formatBytes(view.total)}` : ''}` : ''}
          {view.speed ? `, ${formatSpeed(view.speed)}` : ''}
          {formatEta(view.eta) ? `, ${formatEta(view.eta)}` : ''}
        </p>
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X /> Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
