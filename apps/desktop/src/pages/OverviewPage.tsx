import { Button, Panel, PanelHeader, PanelTitle } from '@downora/ui';
import { ArrowDownToLine, FolderOpen } from 'lucide-react';
import { useEffect } from 'react';
import { Empty, PageTitle, type PageId } from '@/App';
import { JobCard } from '@/components/JobCard';
import { ago, bytes } from '@/lib/format';
import { api } from '@/lib/ipc';
import { useApp } from '@/lib/store';

export function OverviewPage({ go }: { go: (p: PageId) => void }) {
  const { jobs, storage, activity, refreshStorage } = useApp();
  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);
  const active = jobs.filter((j) => j.status === 'downloading' || j.status === 'queued' || j.status === 'paused');
  const done = jobs.filter((j) => j.status === 'completed');
  const usedPct = storage?.freeBytes != null && storage.totalBytes ? 1 - storage.freeBytes / storage.totalBytes : null;

  const stats: [string, string, string?][] = [
    ['Total downloads', String(jobs.length)],
    ['Active', String(active.length)],
    ['Completed', String(done.length)],
    ['Available storage', bytes(storage?.freeBytes), usedPct != null ? `${Math.round(usedPct * 100)}% of disk used` : undefined],
  ];

  return (
    <>
      <PageTitle
        title="Overview"
        description="Everything Downora is doing, at a glance."
        actions={
          <>
            <Button onClick={() => void api.openFolder()}>
              <FolderOpen /> Download folder
            </Button>
            <Button variant="primary" onClick={() => go('downloader')}>
              <ArrowDownToLine /> New download
            </Button>
          </>
        }
      />
      <dl className="tabular grid grid-cols-4 overflow-hidden rounded-panel border border-line bg-surface">
        {stats.map(([label, value, sub], i) => (
          <div key={label} className={`flex flex-col-reverse px-5 py-5 ${i < 3 ? 'border-r border-line' : ''}`}>
            <dt className="label-mono mt-3">
              {label}
              {sub ? <span className="mt-1 block normal-case tracking-normal font-sans text-xs">{sub}</span> : null}
            </dt>
            <dd className="text-[1.75rem] leading-none font-light tracking-[-0.03em]">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_320px] gap-6">
        <Panel>
          <PanelHeader>
            <PanelTitle>Active queue</PanelTitle>
            {active.length ? (
              <Button variant="link" size="sm" onClick={() => go('queue')}>
                Open queue
              </Button>
            ) : null}
          </PanelHeader>
          {active.length ? (
            <ul className="divide-y divide-line">
              {active.slice(0, 4).map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty title="Nothing downloading" action={<Button variant="primary" onClick={() => go('downloader')}>Add a download</Button>}>
                Paste a link in the Downloader, or send one from the Downora browser extension.
              </Empty>
            </div>
          )}
        </Panel>

        <Panel className="h-fit">
          <PanelHeader>
            <PanelTitle>Recent activity</PanelTitle>
          </PanelHeader>
          {activity.length || done.length ? (
            <ul className="divide-y divide-line text-sm">
              {(activity.length
                ? activity
                : done.slice(0, 6).map((j) => ({ id: j.id, at: Date.parse(j.completedAt ?? j.createdAt), text: `Saved: ${j.title}`, tone: 'success' as const }))
              )
                .slice(0, 8)
                .map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 px-5 py-3">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${a.tone === 'success' ? 'bg-success' : a.tone === 'danger' ? 'bg-danger' : 'bg-ink-faint'}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate">{a.text}</p>
                      <p className="text-xs text-ink-faint">{ago(a.at)}</p>
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-ink-muted">No activity yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
