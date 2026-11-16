import { Button, Panel, toast } from '@downora/ui';
import { Pause, Play } from 'lucide-react';
import { Empty, PageTitle, type PageId } from '@/App';
import { JobCard } from '@/components/JobCard';
import { bytes } from '@/lib/format';
import { api, errorText } from '@/lib/ipc';
import { useApp } from '@/lib/store';

export function QueuePage({ go }: { go: (p: PageId) => void }) {
  const { jobs, settings } = useApp();
  const active = jobs.filter((j) => j.status === 'downloading' || j.status === 'queued' || j.status === 'paused');
  const speed = active.reduce((s, j) => s + (j.status === 'downloading' ? j.speedBps ?? 0 : 0), 0);
  const all = (ids: string[], f: (id: string) => Promise<void>) => Promise.all(ids.map(f)).catch((e) => toast.error(errorText(e)));
  return (
    <>
      <PageTitle
        title="Download Queue"
        description={`${settings?.concurrency ?? 2} at a time${settings?.bandwidthLimitKib ? `, capped at ${settings.bandwidthLimitKib} KB/s` : ''}. Change this in Settings.`}
        actions={
          active.length ? (
            <>
              <Button onClick={() => void all(active.filter((j) => j.status === 'paused').map((j) => j.id), api.resume)}>
                <Play /> Resume all
              </Button>
              <Button onClick={() => void all(active.filter((j) => j.status !== 'paused').map((j) => j.id), api.pause)}>
                <Pause /> Pause all
              </Button>
            </>
          ) : null
        }
      />
      {active.length ? (
        <Panel>
          <p className="tabular border-b border-line px-5 py-3 text-sm text-ink-muted">
            {active.filter((j) => j.status === 'downloading').length} downloading · {active.filter((j) => j.status === 'queued').length} waiting ·{' '}
            {active.filter((j) => j.status === 'paused').length} paused{speed ? ` · ${bytes(speed)}/s` : ''}
          </p>
          <ul className="divide-y divide-line" aria-label="Download queue">
            {active.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </ul>
        </Panel>
      ) : (
        <Empty title="The queue is empty" action={<Button variant="primary" onClick={() => go('downloader')}>Add a download</Button>}>
          Downloads you add here or send from the browser extension show up with live progress.
        </Empty>
      )}
    </>
  );
}
