import { Badge, Button, Panel, PanelHeader, PanelTitle } from '@downora/ui';
import { ArrowUpRight, Clock3, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { URLInput } from '@/components/downloader/URLInput';
import { EmptyState } from '@/components/shared/EmptyState';
import { JobRow } from '@/components/shared/JobRow';
import { PageHeader } from '@/components/shared/PageHeader';
import { checkApi, type ApiStatus } from '@/lib/api/client';
import { formatBytes } from '@/lib/format';
import { isActive, useDownloads } from '@/stores/downloads';

function useApiStatus(): ApiStatus | null {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void checkApi(controller.signal).then((s) => {
      if (!controller.signal.aborted) setStatus(s);
    });
    return () => controller.abort();
  }, []);
  return status;
}

export function DashboardPage() {
  const jobs = useDownloads((s) => s.jobs);
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const api = useApiStatus();

  const stats = useMemo(() => {
    const completed = jobs.filter((j) => j.status === 'completed');
    const weekAgo = Date.now() - 7 * 86_400_000;
    return {
      active: jobs.filter(isActive),
      saved: completed.length,
      bytes: completed.reduce((sum, j) => sum + (j.bytesTotal ?? j.bytesReceived), 0),
      thisWeek: completed.filter((j) => Date.parse(j.completedAt ?? j.createdAt) > weekAgo).length,
      failed: jobs.filter((j) => j.status === 'failed').length,
    };
  }, [jobs]);

  const recent = jobs.filter((j) => !isActive(j)).slice(0, 5);

  return (
    <>
      <PageHeader title="Dashboard" description="Paste a link to start, or pick up where you left off." />

      <URLInput
        value={url}
        onChange={setUrl}
        busy={false}
        onSubmit={(value) => {
          if (!value.trim()) return;
          navigate(`/video?url=${encodeURIComponent(value.trim())}`);
        }}
      />

      <dl className="tabular mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line md:grid-cols-4">
        {[
          ['Files saved', String(stats.saved)],
          ['Data saved', formatBytes(stats.bytes)],
          ['Saved this week', String(stats.thisWeek)],
          ['In the queue', String(stats.active.length)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse bg-surface px-5 py-5">
            <dt className="label-mono mt-3">{label}</dt>
            <dd className="text-[1.75rem] leading-none font-light tracking-[-0.03em]">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {stats.active.length ? (
            <Panel>
              <PanelHeader>
                <PanelTitle>In progress</PanelTitle>
                <Button variant="link" size="sm" asChild>
                  <Link to="/queue">Open queue</Link>
                </Button>
              </PanelHeader>
              <ul className="divide-y divide-line">
                {stats.active.slice(0, 3).map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader>
              <PanelTitle>Recent downloads</PanelTitle>
              {recent.length ? (
                <Button variant="link" size="sm" asChild>
                  <Link to="/history">See all</Link>
                </Button>
              ) : null}
            </PanelHeader>
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((job) => (
                  <JobRow key={job.id} job={job} variant="history" />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Clock3}
                title="No downloads yet"
                className="m-5 border-line py-10"
                action={
                  <Button variant="primary" asChild>
                    <Link to="/video">
                      <Plus />
                      Download a video
                    </Link>
                  </Button>
                }
              >
                Finished downloads show up here.
              </EmptyState>
            )}
          </Panel>
        </div>

        <Panel className="h-fit">
          <PanelHeader>
            <PanelTitle>Where Downora runs</PanelTitle>
          </PanelHeader>
          <ul className="divide-y divide-line text-sm">
            <EngineRow name="This browser" note="Saves direct files with live progress." badge={<Badge tone="success" dot>Ready</Badge>} />
            <EngineRow
              name="Downora API"
              note={
                api === null
                  ? 'Checking…'
                  : api.state === 'online'
                    ? `Connected, version ${api.health.version}.`
                    : api.state === 'offline'
                      ? api.message
                      : 'Not configured. Needed for conversion, accounts and sites that block browsers.'
              }
              badge={
                api?.state === 'online' ? (
                  <Badge tone="success" dot>Online</Badge>
                ) : api?.state === 'offline' ? (
                  <Badge tone="danger" dot>Offline</Badge>
                ) : (
                  <Badge dot>Not set up</Badge>
                )
              }
            />
            <EngineRow name="Chrome extension" note="Detects media on the page you’re viewing. Developer preview." badge={<Badge tone="accent">Preview</Badge>} />
          </ul>
          <div className="border-t border-line px-5 py-3">
            <Link to="/help" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent-soft hover:underline">
              What each one can do
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </Panel>
      </div>
      {stats.failed > 0 ? (
        <p className="mt-6 text-sm text-ink-muted">
          {stats.failed} download{stats.failed === 1 ? '' : 's'} failed.{' '}
          <Link to="/history" className="text-accent-soft hover:underline">
            Review in history
          </Link>
        </p>
      ) : null}
    </>
  );
}

function EngineRow({ name, note, badge }: { name: string; note: string; badge: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <p className="font-medium text-ink">{name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{note}</p>
      </div>
      {badge}
    </li>
  );
}
