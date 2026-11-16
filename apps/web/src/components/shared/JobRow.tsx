import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TransferTrack,
  type BadgeProps,
} from '@downora/ui';
import type { DownloadJob, DownloadStatus } from '@downora/types';
import {
  Copy,
  ExternalLink,
  Film,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { cancel, pause, removeJob, resume, retry } from '@/lib/engine/manager';
import { formatBytes, formatDuration, formatEta, formatSpeed, relativeTime } from '@/lib/format';
import { toast } from '@downora/ui';

const STATUS: Record<DownloadStatus, { label: string; tone: BadgeProps['tone'] }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  downloading: { label: 'Downloading', tone: 'violet' },
  paused: { label: 'Paused', tone: 'warn' },
  completed: { label: 'Saved', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  canceled: { label: 'Canceled', tone: 'neutral' },
};

export function StatusBadge({ status }: { status: DownloadStatus }) {
  const { label, tone } = STATUS[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

export function Thumb({ job, className }: { job: Pick<DownloadJob, 'thumbnail' | 'kind' | 'container'>; className?: string }) {
  const Icon = job.kind === 'audio' ? Music2 : Film;
  return (
    <div
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-raised',
        className,
      )}
    >
      {job.thumbnail ? (
        <img src={job.thumbnail} alt="" className="size-full object-cover" />
      ) : (
        <Icon className="size-5 text-ink-faint" aria-hidden />
      )}
    </div>
  );
}

function progressLine(job: DownloadJob): string {
  const received = formatBytes(job.bytesReceived);
  const total = job.bytesTotal ? formatBytes(job.bytesTotal) : null;
  if (job.status === 'downloading') {
    const parts = [total ? `${received} of ${total}` : `${received} received`];
    if (job.speedBps) parts.push(formatSpeed(job.speedBps));
    const eta = formatEta(job.etaSec);
    if (eta) parts.push(eta);
    return parts.join(', ');
  }
  if (job.status === 'paused') {
    return job.bytesReceived > 0 && total ? `Paused at ${received} of ${total}` : 'Paused, not started';
  }
  if (job.status === 'queued') return 'Waiting for a free slot';
  if (job.status === 'completed') return formatBytes(job.bytesTotal ?? job.bytesReceived);
  return '';
}

export function JobRow({ job, variant = 'queue' }: { job: DownloadJob; variant?: 'queue' | 'history' }) {
  const fraction = job.bytesTotal ? job.bytesReceived / job.bytesTotal : null;
  const meta = [job.container.toUpperCase(), job.qualityLabel, job.durationSec ? formatDuration(job.durationSec) : null, job.sourceHost]
    .filter(Boolean)
    .join(', ');
  const showTrack = job.status === 'downloading' || job.status === 'paused' || job.status === 'queued';
  const resumeLabel = job.status === 'paused' && job.bytesReceived > 0 && job.resumable === false ? 'Restart' : 'Resume';

  return (
    <li className="group flex gap-4 px-4 py-4 sm:px-5" data-testid="job-row" data-status={job.status}>
      <Thumb job={job} className="hidden aspect-video w-24 self-start sm:grid" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink" title={job.fileName}>
              {job.fileName}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-muted">{meta}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StatusBadge status={job.status} />
            <JobActions job={job} resumeLabel={resumeLabel} />
          </div>
        </div>

        {showTrack ? (
          <div className="mt-3">
            <TransferTrack
              label={`Progress for ${job.fileName}`}
              value={job.status === 'queued' ? 0 : fraction}
              state={job.status === 'downloading' ? 'active' : job.status === 'paused' ? 'paused' : 'idle'}
            />
            <p className="tabular mt-2 text-xs text-ink-muted" aria-live={job.status === 'downloading' ? 'off' : 'polite'}>
              {progressLine(job)}
            </p>
          </div>
        ) : (
          <p className="tabular mt-2 text-xs text-ink-muted">
            {job.status === 'failed' ? (
              <span className="text-danger">{job.errorMessage ?? 'The download failed.'}</span>
            ) : (
              <>
                {progressLine(job)}
                {job.status === 'completed' ? ', ' : ''}
                {relativeTime(job.completedAt ?? job.createdAt)}
              </>
            )}
          </p>
        )}

        {variant === 'queue' && (job.status === 'downloading' || job.status === 'paused' || job.status === 'queued') ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {job.status === 'downloading' ? (
              <Button size="sm" onClick={() => pause(job.id)}>
                <Pause />
                Pause
              </Button>
            ) : job.status === 'paused' ? (
              <Button size="sm" onClick={() => resume(job.id)}>
                <Play />
                {resumeLabel}
              </Button>
            ) : (
              <Button size="sm" onClick={() => pause(job.id)}>
                <Pause />
                Hold
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => cancel(job.id)}>
              <X />
              Cancel
            </Button>
          </div>
        ) : null}
        {job.status === 'failed' || job.status === 'canceled' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => retry(job.id)}>
              <RotateCcw />
              Retry
            </Button>
            {job.errorCode === 'blocked' ? (
              <Button size="sm" variant="ghost" asChild>
                <a href={job.sourceUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Open file
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function JobActions({ job, resumeLabel }: { job: DownloadJob; resumeLabel: string }) {
  const finished = job.status === 'completed' || job.status === 'failed' || job.status === 'canceled';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${job.fileName}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {job.status === 'downloading' ? (
          <DropdownMenuItem onSelect={() => pause(job.id)}>
            <Pause />
            Pause
          </DropdownMenuItem>
        ) : null}
        {job.status === 'paused' ? (
          <DropdownMenuItem onSelect={() => resume(job.id)}>
            <Play />
            {resumeLabel}
          </DropdownMenuItem>
        ) : null}
        {finished ? (
          <DropdownMenuItem onSelect={() => retry(job.id)}>
            <RotateCcw />
            {job.status === 'completed' ? 'Download again' : 'Retry'}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard
              .writeText(job.sourceUrl)
              .then(() => toast.success('Link copied'))
              .catch(() => toast.error('Your browser blocked clipboard access'));
          }}
        >
          <Copy />
          Copy source link
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={job.sourceUrl} target="_blank" rel="noreferrer noopener">
            <ExternalLink />
            Open source
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {finished ? (
          <DropdownMenuItem destructive onSelect={() => removeJob(job.id)}>
            <Trash2 />
            Remove from history
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem destructive onSelect={() => cancel(job.id)}>
            <X />
            Cancel download
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
