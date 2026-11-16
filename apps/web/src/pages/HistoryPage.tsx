import type { DownloadStatus } from '@downora/types';
import { Button, ConfirmDialog, Input, Panel, SegmentedControl } from '@downora/ui';
import { Clock3, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AccountHistory } from '@/components/shared/AccountHistory';
import { EmptyState } from '@/components/shared/EmptyState';
import { JobRow } from '@/components/shared/JobRow';
import { PageHeader } from '@/components/shared/PageHeader';
import { FINISHED_STATUSES, useDownloads } from '@/stores/downloads';

type StatusFilter = 'all' | Extract<DownloadStatus, 'completed' | 'failed' | 'canceled'>;
type KindFilter = 'all' | 'video' | 'audio';

export function HistoryPage() {
  const jobs = useDownloads((s) => s.jobs);
  const clearFinished = useDownloads((s) => s.clearFinished);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const finished = useMemo(() => jobs.filter((j) => FINISHED_STATUSES.includes(j.status)), [jobs]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return finished.filter(
      (j) =>
        (status === 'all' || j.status === status) &&
        (kind === 'all' || j.kind === kind) &&
        (!q || j.fileName.toLowerCase().includes(q) || j.sourceHost.toLowerCase().includes(q)),
    );
  }, [finished, query, status, kind]);

  return (
    <>
      <PageHeader
        title="History"
        description="Every download you’ve finished, failed or canceled in this browser."
        actions={
          finished.length ? (
            <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
              <Trash2 />
              Clear history
            </Button>
          ) : null
        }
      />

      {finished.length === 0 ? (
        <EmptyState
          icon={Clock3}
          title="No downloads yet"
          action={
            <Button variant="primary" asChild>
              <Link to="/video">
                <Plus />
                Download something
              </Link>
            </Button>
          }
        >
          When a download finishes it’s listed here, so you can find the file name or save it again.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative md:max-w-xs md:flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
              <Input
                type="search"
                placeholder="Search by file name or site"
                aria-label="Search history"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="ios-search h-11 rounded-[0.75rem] pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2 md:ml-auto">
              <SegmentedControl
                aria-label="Filter by status"
                size="sm"
                value={status}
                onValueChange={setStatus}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'completed', label: 'Saved' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'canceled', label: 'Canceled' },
                ]}
              />
              <SegmentedControl
                aria-label="Filter by type"
                size="sm"
                value={kind}
                onValueChange={setKind}
                options={[
                  { value: 'all', label: 'All types' },
                  { value: 'video', label: 'Video' },
                  { value: 'audio', label: 'Audio' },
                ]}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Search} title="No matches">
              Nothing in your history matches these filters.
            </EmptyState>
          ) : (
            <Panel>
              <ul className="divide-y divide-line" aria-label="Download history">
                {visible.map((job) => (
                  <JobRow key={job.id} job={job} variant="history" />
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      <AccountHistory />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Clear download history?"
        description="This removes the list from Downora. Files you already saved stay on your device."
        confirmLabel="Clear history"
        destructive
        onConfirm={clearFinished}
      />
    </>
  );
}
