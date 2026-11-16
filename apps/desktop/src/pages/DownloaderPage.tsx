import { Badge, Button, Input, Panel, Skeleton, TransferTrack, toast } from '@downora/ui';
import { AlertTriangle, ClipboardPaste, Download, Folder, Search } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { PageTitle, type PageId } from '@/App';
import { bytes, duration, eta } from '@/lib/format';
import { api, errorText, type Analysis } from '@/lib/ipc';
import { useApp } from '@/lib/store';

export function DownloaderPage({ go }: { go: (p: PageId) => void }) {
  const settings = useApp((s) => s.settings);
  const jobs = useApp((s) => s.jobs);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [analysis, setAnalysis] = useState<Analysis>();
  const [title, setTitle] = useState('');
  const [dir, setDir] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string>();
  const fieldId = useId();
  const titleId = useId();
  const job = jobs.find((j) => j.id === jobId);

  const analyze = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!url.trim()) return setError('Paste a link to a media file first.');
    setBusy(true);
    setError(undefined);
    setAnalysis(undefined);
    setJobId(undefined);
    try {
      const a = await api.analyzeUrl(url.trim());
      setAnalysis(a);
      setTitle(a.title);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setUrl(text);
      else toast('The clipboard is empty');
    } catch {
      toast.error('Couldn’t read the clipboard. Press ⌘V or Ctrl+V in the link field.');
    }
  };

  const chooseDir = async () => {
    const d = await api.pickFolder('Save this download in…').catch(() => null);
    if (d) setDir(d);
    return d;
  };

  const start = async () => {
    if (!analysis) return;
    let target = dir;
    if (!target && settings?.askWhereToSave) {
      target = await chooseDir();
      if (!target) return;
    }
    try {
      const j = await api.addDownload({ url: analysis.url, title, container: analysis.container, quality: analysis.quality, dir: target });
      setJobId(j.id);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const fraction = job?.bytesTotal ? job.bytesReceived / job.bytesTotal : null;

  return (
    <>
      <PageTitle title="Downloader" description="Paste a direct link to an MP4, WebM, MP3, M4A or WAV file." />
      <form onSubmit={analyze} className="flex gap-2 rounded-full border border-line bg-surface p-1.5 focus-within:border-line-strong">
        <label htmlFor={fieldId} className="sr-only">
          Media link
        </label>
        <Input
          id={fieldId}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/media/clip.mp4"
          spellCheck={false}
          autoFocus
          className="h-11 flex-1 rounded-full border-transparent bg-transparent px-4 hover:border-transparent focus-visible:border-transparent focus-visible:ring-0"
          aria-invalid={Boolean(error) || undefined}
        />
        <Button type="button" size="lg" onClick={() => void paste()}>
          <ClipboardPaste /> Paste
        </Button>
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          {busy ? null : <Search />} {busy ? 'Analyzing' : 'Analyze'}
        </Button>
      </form>

      <div className="mt-6" aria-live="polite">
        {busy ? (
          <Panel className="flex gap-5 p-5" aria-busy="true">
            <Skeleton className="aspect-video w-56" />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </Panel>
        ) : error ? (
          <Panel role="alert" className="flex gap-3 p-5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <p>{error}</p>
          </Panel>
        ) : analysis ? (
          <Panel className="p-6" data-testid="analysis">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
              <div>
                <label htmlFor={titleId} className="label-mono">
                  File name
                </label>
                <div className="mt-2 flex items-center rounded-control border border-line bg-canvas pr-3 focus-within:border-line-strong">
                  <Input id={titleId} value={title} onChange={(e) => setTitle(e.target.value)} className="border-0 bg-transparent focus-visible:ring-0" />
                  <span className="text-sm text-ink-faint">.{analysis.container}</span>
                </div>
                <dl className="tabular mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  <dt className="text-ink-faint">Source</dt>
                  <dd>{analysis.host}</dd>
                  <dt className="text-ink-faint">Format</dt>
                  <dd className="flex items-center gap-2">
                    {analysis.container?.toUpperCase()} {analysis.quality ? <Badge tone="accent">{analysis.quality}</Badge> : null}
                  </dd>
                  {analysis.width ? (
                    <>
                      <dt className="text-ink-faint">Resolution</dt>
                      <dd>
                        {analysis.width} × {analysis.height}
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-ink-faint">Duration</dt>
                  <dd>{duration(analysis.durationSec)}</dd>
                  <dt className="text-ink-faint">Size</dt>
                  <dd>{analysis.sizeBytes ? bytes(analysis.sizeBytes) : 'Not reported by the server'}</dd>
                  <dt className="text-ink-faint">Pause & resume</dt>
                  <dd>{analysis.resumable ? 'Supported by this server' : 'Not supported: pausing restarts the file'}</dd>
                </dl>
              </div>
              <div className="flex flex-col justify-between gap-4">
                <div>
                  <p className="label-mono">Save to</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate rounded-control border border-line bg-canvas px-3 py-2.5 text-sm" data-selectable>
                      {dir ?? settings?.downloadDir}
                    </p>
                    <Button onClick={() => void chooseDir()}>
                      <Folder /> Change
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">Only this format is offered because it’s the file at the link. Convert it afterwards in the Media Converter.</p>
                </div>
                {job ? (
                  <div data-testid="inline-progress">
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{job.status === 'completed' ? 'Saved' : job.status === 'failed' ? 'Failed' : job.status === 'paused' ? 'Paused' : 'Downloading'}</span>
                      <span className="text-2xl font-light tracking-[-0.03em]">{job.status === 'completed' ? '100%' : fraction != null ? `${Math.floor(fraction * 100)}%` : ''}</span>
                    </div>
                    <TransferTrack className="mt-2" label="Download progress" value={job.status === 'completed' ? 1 : fraction} state={job.status === 'completed' ? 'done' : job.status === 'failed' ? 'failed' : job.status === 'paused' ? 'paused' : 'active'} />
                    <p className="tabular mt-1.5 text-xs text-ink-muted">
                      {job.status === 'failed' ? job.error : `${bytes(job.bytesReceived)}${job.bytesTotal ? ` of ${bytes(job.bytesTotal)}` : ''}${job.speedBps ? ` · ${bytes(job.speedBps)}/s` : ''}${eta(job.etaSec) ? ` · ${eta(job.etaSec)}` : ''}`}
                    </p>
                    <Button variant="link" size="sm" className="mt-2" onClick={() => go('queue')}>
                      Open the queue
                    </Button>
                  </div>
                ) : (
                  <Button variant="primary" size="lg" onClick={() => void start()} disabled={!title.trim()}>
                    <Download /> Download {analysis.container?.toUpperCase()} {analysis.sizeBytes ? <span className="font-normal opacity-70">{bytes(analysis.sizeBytes)}</span> : null}
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
