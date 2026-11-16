import { Button, Panel } from '@downora/ui';
import { ListOrdered, Pause, Play, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { JobRow } from '@/components/shared/JobRow';
import { PageHeader } from '@/components/shared/PageHeader';
import { pause, resume } from '@/lib/engine/manager';
import { formatBytes } from '@/lib/format';
import { isActive, useDownloads } from '@/stores/downloads';
import { useSettings } from '@/stores/settings';

export function QueuePage() {
  const jobs = useDownloads((s) => s.jobs);
  const concurrency = useSettings((s) => s.settings.concurrency);
  const active = useMemo(() => jobs.filter(isActive), [jobs]);
  const downloading = active.filter((j) => j.status === 'downloading');
  const paused = active.filter((j) => j.status === 'paused');
  const totalSpeed = downloading.reduce((sum, j) => sum + (j.speedBps ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Queue"
        description={`Up to ${concurrency} download${concurrency === 1 ? '' : 's'} run at once. Change this in Settings.`}
        actions={
          active.length ? (
            <>
              {paused.length ? (
                <Button onClick={() => paused.forEach((j) => resume(j.id))}>
                  <Play />
                  Resume all
                </Button>
              ) : null}
              {downloading.length || active.some((j) => j.status === 'queued') ? (
                <Button onClick={() => active.filter((j) => j.status !== 'paused').forEach((j) => pause(j.id))}>
                  <Pause />
                  Pause all
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      {active.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="Nothing in the queue"
          action={
            <Button variant="primary" asChild>
              <Link to="/video">
                <Plus />
                Add a download
              </Link>
            </Button>
          }
        >
          Downloads you start appear here with their live progress. Finished ones move to History.
        </EmptyState>
      ) : (
        <Panel>
          <div className="tabular flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-5 py-3 text-sm text-ink-muted">
            <span>
              <span className="font-semibold text-ink">{downloading.length}</span> downloading
            </span>
            <span>
              <span className="font-semibold text-ink">{active.filter((j) => j.status === 'queued').length}</span> waiting
            </span>
            <span>
              <span className="font-semibold text-ink">{paused.length}</span> paused
            </span>
            {totalSpeed > 0 ? <span className="sm:ml-auto">{formatBytes(totalSpeed)}/s combined</span> : null}
          </div>
          <ul className="divide-y divide-line" aria-label="Active downloads">
            {active.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
