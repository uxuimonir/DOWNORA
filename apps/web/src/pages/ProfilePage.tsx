import { Badge, Button, ConfirmDialog, Panel, PanelHeader, PanelTitle, toast } from '@downora/ui';
import { Download, HardDrive, LogIn, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatBytes } from '@/lib/format';
import { useDownloads } from '@/stores/downloads';
import { useSettings } from '@/stores/settings';

function useStorageEstimate() {
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setEstimate({ usage: e.usage, quota: e.quota }));
  }, []);
  return estimate;
}

export function ProfilePage() {
  const jobs = useDownloads((s) => s.jobs);
  const settings = useSettings((s) => s.settings);
  const [confirmErase, setConfirmErase] = useState(false);
  const storage = useStorageEstimate();

  const summary = useMemo(() => {
    const done = jobs.filter((j) => j.status === 'completed');
    const first = jobs.at(-1)?.createdAt;
    return {
      files: done.length,
      bytes: done.reduce((s, j) => s + (j.bytesTotal ?? j.bytesReceived), 0),
      video: done.filter((j) => j.kind === 'video').length,
      audio: done.filter((j) => j.kind === 'audio').length,
      since: first ? new Date(first).toLocaleDateString(undefined, { dateStyle: 'long' }) : null,
    };
  }, [jobs]);

  const exportData = () => {
    const payload = { exportedAt: new Date().toISOString(), app: 'downora-web', settings, history: jobs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `downora-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    toast.success('Exported your Downora data');
  };

  return (
    <>
      <PageHeader title="Profile" description="You’re using Downora without an account. Everything below lives in this browser only." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <div className="flex items-center gap-4 p-5">
            <span className="accent-gradient grid size-14 shrink-0 place-items-center rounded-full">
              <HardDrive className="size-6 text-canvas" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold">Local workspace</p>
              <p className="text-sm text-ink-muted">{summary.since ? `First download on ${summary.since}` : 'No downloads yet'}</p>
            </div>
            <Badge className="ml-auto" dot>
              Not signed in
            </Badge>
          </div>
          <dl className="tabular grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            {[
              ['Files saved', summary.files],
              ['Data saved', formatBytes(summary.bytes)],
              ['Videos', summary.video],
              ['Audio', summary.audio],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex flex-col-reverse bg-surface px-5 py-5">
                <dt className="label-mono mt-3">{k}</dt>
                <dd className="text-[1.5rem] leading-none font-light tracking-[-0.03em]">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel className="flex flex-col p-5">
          <p className="font-semibold">Sync across devices</p>
          <p className="mt-1.5 text-sm text-ink-muted">
            Accounts will sync history and settings between the web app, extension and desktop app. They aren’t available
            yet.
          </p>
          <Button className="mt-4 self-start" asChild>
            <Link to="/sign-in">
              <LogIn />
              About accounts
            </Link>
          </Button>
        </Panel>
      </div>

      <Panel className="mt-6">
        <PanelHeader>
          <PanelTitle>Your data</PanelTitle>
        </PanelHeader>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-ink-muted">
            <p>
              {jobs.length} history {jobs.length === 1 ? 'entry' : 'entries'} and your settings are stored in this browser.
            </p>
            {storage?.usage !== undefined ? (
              <p className="tabular mt-0.5">This site uses {formatBytes(storage.usage)} of browser storage.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportData}>
              <Download />
              Export as JSON
            </Button>
            <Button variant="danger" onClick={() => setConfirmErase(true)}>
              <Trash2 />
              Erase all data
            </Button>
          </div>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmErase}
        onOpenChange={setConfirmErase}
        title="Erase all Downora data?"
        description="This cancels active downloads and removes your history and settings from this browser. Files you already saved stay on your device."
        confirmLabel="Erase everything"
        destructive
        onConfirm={() => {
          useDownloads.setState({ jobs: [] });
          useSettings.getState().reset();
          localStorage.removeItem('downora.downloads');
          localStorage.removeItem('downora.settings');
          toast.success('All Downora data erased');
          setTimeout(() => window.location.reload(), 600);
        }}
      />
    </>
  );
}
