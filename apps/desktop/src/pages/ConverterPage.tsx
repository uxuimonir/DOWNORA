import { Badge, Button, ConfirmDialog, Panel, PanelHeader, PanelTitle, SegmentedControl, TransferTrack, toast } from '@downora/ui';
import { AlertTriangle, FileVideo, Folder, FolderOpen, Plus, Wand2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty, PageTitle } from '@/App';
import { bytes, duration, fileName } from '@/lib/format';
import { api, errorText, type Container, type Preset, type ProbeInfo } from '@/lib/ipc';
import { useApp } from '@/lib/store';

interface Input {
  path: string;
  info?: ProbeInfo;
  error?: string;
}

const PRESETS: { value: Preset; label: string; hint: string }[] = [
  { value: 'high', label: 'High', hint: 'Best quality, larger files' },
  { value: 'balanced', label: 'Balanced', hint: 'Good quality, moderate size' },
  { value: 'small', label: 'Small', hint: 'Smaller files; video shrinks to 720p at most (never upscaled)' },
];

export function ConverterPage() {
  const { info, conversions } = useApp();
  const [inputs, setInputs] = useState<Input[]>([]);
  const [format, setFormat] = useState<Container>('mp3');
  const [preset, setPreset] = useState<Preset>('balanced');
  const [outDir, setOutDir] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; input: string } | null>(null);
  const takeConvertInput = useApp((s) => s.takeConvertInput);

  const addPaths = (paths: string[]) => {
    const fresh = paths.map((path) => ({ path }));
    setInputs((cur) => [...cur, ...fresh.filter((f) => !cur.some((i) => i.path === f.path))]);
    for (const f of fresh) {
      api.probeFile(f.path).then(
        (info) => setInputs((cur) => cur.map((i) => (i.path === f.path ? { ...i, info } : i))),
        (e) => setInputs((cur) => cur.map((i) => (i.path === f.path ? { ...i, error: errorText(e) } : i))),
      );
    }
  };

  // "Convert" on a finished download lands here with that file.
  useEffect(() => {
    const p = takeConvertInput();
    if (p) addPaths([p]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!info?.ffmpeg) {
    return (
      <>
        <PageTitle title="Media Converter" />
        <Panel role="alert" className="flex max-w-2xl gap-3 p-5">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="font-medium">FFmpeg isn’t installed</p>
            <p className="mt-1 text-sm text-ink-muted">
              Conversion uses FFmpeg. Install it (macOS: <code className="font-mono text-ink">brew install ffmpeg</code>, Windows: <code className="font-mono text-ink">winget install ffmpeg</code>), then restart Downora.
            </p>
          </div>
        </Panel>
      </>
    );
  }

  const outputs = info.outputs;
  const selectedOut = outputs.find((o) => o.container === format);
  const addFiles = async () => {
    const files = await api.pickMediaFiles().catch((e) => (toast.error(errorText(e)), [] as string[]));
    addPaths(files);
  };

  const convertOne = async (input: string, overwrite: boolean) => {
    const dir = outDir ?? input.replace(/[\\/][^\\/]+$/, '');
    const res = await api.convert({ input, outputDir: dir, format, preset, overwrite });
    if (res.result === 'needsConfirmation') setConfirm({ message: res.message, input });
  };

  const start = async () => {
    for (const i of inputs.filter((x) => x.info)) {
      await convertOne(i.path, false).catch((e) => toast.error(`${fileName(i.path)}: ${errorText(e)}`));
    }
  };

  const running = conversions.filter((c) => c.status === 'running');

  return (
    <>
      <PageTitle title="Media Converter" description={`Convert your own files or your downloads with FFmpeg ${info.ffmpeg.version}. Originals are never changed.`} />
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6">
        <Panel>
          <PanelHeader>
            <PanelTitle>Files</PanelTitle>
            <Button size="sm" onClick={() => void addFiles()}>
              <Plus /> Add files
            </Button>
          </PanelHeader>
          {inputs.length ? (
            <ul className="divide-y divide-line">
              {inputs.map((i) => (
                <li key={i.path} className="flex items-center gap-3 px-5 py-3">
                  <FileVideo className="size-5 shrink-0 text-ink-faint" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" data-selectable>{fileName(i.path)}</p>
                    <p className="text-xs text-ink-muted">
                      {i.error ? (
                        <span className="text-danger">{i.error}</span>
                      ) : i.info ? (
                        [i.info.videoCodec ? `${i.info.width}×${i.info.height} ${i.info.videoCodec}` : null, i.info.audioCodec, duration(i.info.durationSec), bytes(i.info.sizeBytes)].filter(Boolean).join(' · ')
                      ) : (
                        'Reading…'
                      )}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${fileName(i.path)}`} onClick={() => setInputs((c) => c.filter((x) => x.path !== i.path))}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <Empty title="Add files to convert" action={<Button variant="primary" onClick={() => void addFiles()}><Plus /> Add files</Button>}>
                Video or audio files you own, or files Downora downloaded.
              </Empty>
            </div>
          )}
        </Panel>

        <Panel className="h-fit p-5">
          <p className="label-mono">Output format</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Output format">
            {outputs.map((o) => (
              <button
                key={o.container}
                type="button"
                role="radio"
                aria-checked={format === o.container}
                disabled={!o.available}
                title={o.missing ?? o.encoders ?? undefined}
                onClick={() => setFormat(o.container)}
                className={`h-10 rounded-control border text-sm font-semibold disabled:opacity-35 ${format === o.container ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-raised text-ink-muted hover:text-ink'}`}
              >
                {o.container.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            {selectedOut?.available ? `Uses ${selectedOut.encoders}.` : selectedOut?.missing}
            {['mp3', 'wav', 'm4a'].includes(format) ? ' Audio is extracted; video is dropped.' : ''}
          </p>

          <p className="label-mono mt-5">Quality</p>
          <SegmentedControl aria-label="Quality preset" className="mt-2 grid grid-cols-3" value={preset} onValueChange={setPreset} options={PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
          <p className="mt-2 text-xs text-ink-faint">{PRESETS.find((p) => p.value === preset)?.hint}</p>

          <p className="label-mono mt-5">Save to</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-ink-muted" data-selectable>{outDir ?? 'Same folder as each file'}</p>
            <Button size="sm" onClick={() => void api.pickFolder('Save converted files in…').then((d) => { if (d) setOutDir(d); })}>
              <Folder /> Change
            </Button>
          </div>

          <Button variant="primary" size="lg" className="mt-6 w-full" disabled={!inputs.some((i) => i.info) || !selectedOut?.available} onClick={() => void start()}>
            <Wand2 /> Convert {inputs.filter((i) => i.info).length || ''} to {format.toUpperCase()}
          </Button>
        </Panel>
      </div>

      <Panel className="mt-6">
        <PanelHeader>
          <PanelTitle>Conversions</PanelTitle>
          {conversions.some((c) => c.status !== 'running') ? (
            <Button variant="link" size="sm" onClick={() => void api.clearConversions()}>
              Clear finished
            </Button>
          ) : null}
        </PanelHeader>
        {conversions.length ? (
          <ul className="divide-y divide-line" aria-label="Conversion history">
            {conversions.map((c) => (
              <li key={c.id} className="px-5 py-3.5" data-testid="conversion" data-status={c.status}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" data-selectable>{fileName(c.output)}</p>
                    <p className="truncate text-xs text-ink-muted">from {fileName(c.input)} · {c.preset}</p>
                  </div>
                  <Badge tone={c.status === 'completed' ? 'success' : c.status === 'failed' ? 'danger' : c.status === 'running' ? 'accent' : 'neutral'} dot>
                    {c.status === 'running' ? 'Converting' : c.status === 'completed' ? 'Done' : c.status === 'failed' ? 'Failed' : 'Canceled'}
                  </Badge>
                  {c.status === 'running' ? (
                    <Button size="sm" variant="ghost" onClick={() => void api.cancelConversion(c.id)}>
                      <X /> Cancel
                    </Button>
                  ) : c.status === 'completed' ? (
                    <Button size="sm" variant="ghost" onClick={() => void api.revealConversion(c.id).catch((e) => toast.error(errorText(e)))}>
                      <FolderOpen /> Show
                    </Button>
                  ) : null}
                </div>
                {c.status === 'running' ? <TransferTrack size="sm" className="mt-2" label={`Converting ${fileName(c.input)}`} value={c.progress} /> : null}
                {c.status === 'failed' ? <p className="mt-1 text-xs text-danger" data-selectable>{c.error}</p> : null}
                {c.status === 'completed' && c.sizeBytes ? <p className="mt-1 text-xs text-ink-muted">{bytes(c.sizeBytes)}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-ink-muted">{running.length ? '' : 'No conversions yet.'}</p>
        )}
      </Panel>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Replace the existing file?"
        description={confirm?.message ?? ''}
        confirmLabel="Replace"
        destructive
        onConfirm={() => confirm && void convertOne(confirm.input, true).catch((e) => toast.error(errorText(e)))}
      />
    </>
  );
}
