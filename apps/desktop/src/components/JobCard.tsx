import { Badge, Button, TransferTrack, toast, type BadgeProps } from '@downora/ui';
import { Film, FolderOpen, Music2, Pause, Play, Puzzle, RotateCcw, Trash2, Wand2, X, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { api, errorText, type Job, type Status } from '@/lib/ipc';
import { bytes, duration, eta, ago } from '@/lib/format';
import { useApp } from '@/lib/store';

const STATUS: Record<Status, { label: string; tone: BadgeProps['tone'] }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  downloading: { label: 'Downloading', tone: 'accent' },
  paused: { label: 'Paused', tone: 'warn' },
  completed: { label: 'Saved', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  canceled: { label: 'Canceled', tone: 'neutral' },
};

const run = (p: Promise<unknown>) => p.catch((e) => toast.error(errorText(e)));

export function JobCard({ job }: { job: Job }) {
  const thumb = useApp((s) => s.thumbs[job.id]);
  const loadThumb = useApp((s) => s.loadThumb);
  const convertDownload = useApp((s) => s.convertDownload);
  useEffect(() => {
    if (job.thumbnail && thumb === undefined) loadThumb(job.id);
  }, [job.thumbnail, job.id, thumb, loadThumb]);

  const fileName = job.path ? job.path.split(/[\\/]/).pop()! : `${job.stem}${job.container ? `.${job.container}` : ''}`;
  const fraction = job.bytesTotal ? job.bytesReceived / job.bytesTotal : null;
  const active = job.status === 'downloading' || job.status === 'paused' || job.status === 'queued';
  const Icon = job.kind === 'audio' ? Music2 : Film;
  const meta = [
    job.container?.toUpperCase(),
    job.quality ?? (job.width && job.height ? `${job.width}×${job.height}` : null),
    job.durationSec ? duration(job.durationSec) : null,
    job.bytesTotal ? bytes(job.bytesTotal) : null,
  ].filter(Boolean);
  const host = (() => {
    try {
      return new URL(job.url).host;
    } catch {
      return '';
    }
  })();
  const restart = job.status === 'paused' && job.bytesReceived > 0 && job.resumable === false;

  return (
    <li className="flex gap-4 px-5 py-4" data-testid="job" data-status={job.status}>
      <div className="grid aspect-video w-28 shrink-0 place-items-center self-start overflow-hidden rounded-[0.625rem] bg-raised">
        {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <Icon className="size-5 text-ink-faint" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium" title={fileName} data-selectable>
              {fileName}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-muted">
              {job.source.type === 'browser' ? <Puzzle className="size-3 shrink-0 text-accent" aria-label="From the browser" /> : null}
              {[...meta, host].join(' · ')}
            </p>
          </div>
          <Badge tone={STATUS[job.status].tone} dot>
            {STATUS[job.status].label}
          </Badge>
        </div>

        {active ? (
          <div className="mt-3">
            <TransferTrack
              label={`Progress for ${fileName}`}
              value={job.status === 'queued' ? 0 : fraction}
              state={job.status === 'downloading' ? 'active' : job.status === 'paused' ? 'paused' : 'idle'}
            />
            <p className="tabular mt-1.5 text-xs text-ink-muted">
              {job.status === 'queued'
                ? 'Waiting for a free slot'
                : [
                    `${bytes(job.bytesReceived)}${job.bytesTotal ? ` of ${bytes(job.bytesTotal)}` : ''}`,
                    job.status === 'downloading' && job.speedBps ? `${bytes(job.speedBps)}/s` : null,
                    job.status === 'downloading' ? eta(job.etaSec) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>
        ) : job.status === 'failed' ? (
          <p className="mt-2 text-xs text-danger" data-selectable>
            {job.error}
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">{ago(job.completedAt ?? job.createdAt)}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.status === 'downloading' ? (
            <Button size="sm" onClick={() => run(api.pause(job.id))}>
              <Pause /> Pause
            </Button>
          ) : null}
          {job.status === 'paused' ? (
            <Button size="sm" onClick={() => run(api.resume(job.id))}>
              <Play /> {restart ? 'Restart' : 'Resume'}
            </Button>
          ) : null}
          {active ? (
            <Button size="sm" variant="ghost" onClick={() => run(api.cancel(job.id))}>
              <X /> Cancel
            </Button>
          ) : null}
          {job.status === 'failed' || job.status === 'canceled' ? (
            <Button size="sm" onClick={() => run(api.retry(job.id))}>
              <RotateCcw /> Retry
            </Button>
          ) : null}
          {job.status === 'completed' ? (
            <>
              <Button size="sm" onClick={() => run(api.openFile(job.id))}>
                <ExternalLink /> Open
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run(api.reveal(job.id))}>
                <FolderOpen /> Show in folder
              </Button>
              {job.path ? (
                <Button size="sm" variant="ghost" onClick={() => convertDownload(job.path!)}>
                  <Wand2 /> Convert
                </Button>
              ) : null}
            </>
          ) : null}
          {!active ? (
            <Button size="sm" variant="ghost" onClick={() => run(api.remove(job.id))} aria-label={`Remove ${fileName} from the list`}>
              <Trash2 /> Remove
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
