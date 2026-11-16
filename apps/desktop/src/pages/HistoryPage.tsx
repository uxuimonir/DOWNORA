import { Button, Input, Panel, SegmentedControl, toast } from '@downora/ui';
import { Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty, PageTitle, type PageId } from '@/App';
import { JobCard } from '@/components/JobCard';
import { api, errorText } from '@/lib/ipc';
import { useApp } from '@/lib/store';

export function HistoryPage({ go }: { go: (p: PageId) => void }) {
  const jobs = useApp((s) => s.jobs);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed' | 'canceled'>('all');
  const finished = jobs.filter((j) => j.status === 'completed' || j.status === 'failed' || j.status === 'canceled');
  const shown = useMemo(
    () => finished.filter((j) => (filter === 'all' || j.status === filter) && (!q || `${j.title} ${j.url}`.toLowerCase().includes(q.toLowerCase()))),
    [finished, filter, q],
  );
  return (
    <>
      <PageTitle
        title="History"
        description="Finished, failed and canceled downloads. Removing an entry never deletes the saved file."
        actions={
          finished.length ? (
            <Button variant="ghost" onClick={() => void api.clearFinished().catch((e) => toast.error(errorText(e)))}>
              <Trash2 /> Clear history
            </Button>
          ) : null
        }
      />
      {finished.length === 0 ? (
        <Empty title="No downloads yet" action={<Button variant="primary" onClick={() => go('downloader')}>Download something</Button>} />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <div className="relative w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
              <Input type="search" aria-label="Search history" placeholder="Search by name or link" value={q} onChange={(e) => setQ(e.target.value)} className="ios-search rounded-[0.75rem] pl-9" />
            </div>
            <SegmentedControl
              aria-label="Filter by status"
              className="ml-auto"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'completed', label: 'Saved' },
                { value: 'failed', label: 'Failed' },
                { value: 'canceled', label: 'Canceled' },
              ]}
            />
          </div>
          {shown.length ? (
            <Panel>
              <ul className="divide-y divide-line" aria-label="Download history">
                {shown.map((j) => (
                  <JobCard key={j.id} job={j} />
                ))}
              </ul>
            </Panel>
          ) : (
            <Empty title="No matches">Nothing matches this search and filter.</Empty>
          )}
        </>
      )}
    </>
  );
}
