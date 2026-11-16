import { Button, Panel, SegmentedControl, SelectField, Switch, toast } from '@downora/ui';
import { Folder } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { PageTitle } from '@/App';
import { api, errorText, type Settings } from '@/lib/ipc';
import { useApp } from '@/lib/store';

function Row({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-8 px-5 py-3.5">
      <div className="min-w-0">
        {id ? <label htmlFor={id} className="text-sm">{label}</label> : <p className="text-sm">{label}</p>}
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="label-mono mb-2 px-1">{title}</h2>
      <Panel className="divide-y divide-line">{children}</Panel>
    </section>
  );
}

export function SettingsPage() {
  const { settings, info, setSettings, refreshStorage } = useApp();
  const ids = { ask: useId(), tpl: useId(), dup: useId(), bw: useId(), start: useId(), tray: useId(), bridge: useId(), n1: useId(), n2: useId(), n3: useId(), n4: useId(), n5: useId() };
  if (!settings) return null;

  const save = async (patch: Partial<Settings>) => {
    try {
      setSettings(await api.updateSettings({ ...settings, ...patch }));
      if (patch.downloadDir) void refreshStorage();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const notif = (k: keyof Settings['notifications'], v: boolean) => save({ notifications: { ...settings.notifications, [k]: v } });

  return (
    <>
      <PageTitle title="Settings" description="Saved automatically." />
      <Group title="Download location">
        <Row label="Default folder" hint={<span data-selectable>{settings.downloadDir}</span>}>
          <Button size="sm" onClick={() => void api.pickFolder('Choose the default download folder').then((d) => { if (d) void save({ downloadDir: d }); })}>
            <Folder /> Change
          </Button>
        </Row>
        <Row id={ids.ask} label="Ask where to save" hint="For downloads you add in this app. Downloads from the browser go to the default folder.">
          <Switch id={ids.ask} checked={settings.askWhereToSave} onCheckedChange={(v) => void save({ askWhereToSave: v })} />
        </Row>
        <Row id={ids.tpl} label="File names">
          <SelectField id={ids.tpl} className="w-56" value={settings.nameTemplate} onValueChange={(v) => void save({ nameTemplate: v })} options={[{ value: 'title', label: 'Title' }, { value: 'title-quality', label: 'Title-quality (clip-1080p)' }, { value: 'title-date', label: 'Title-date (clip-2026-11-16)' }]} />
        </Row>
        <Row id={ids.dup} label="When a file already exists">
          <SelectField id={ids.dup} className="w-56" value={settings.duplicates} onValueChange={(v) => void save({ duplicates: v })} options={[{ value: 'rename', label: 'Keep both (add a number)' }, { value: 'replace', label: 'Replace the old file' }]} />
        </Row>
      </Group>

      <Group title="Downloads">
        <Row label="Downloads at once">
          <SegmentedControl aria-label="Downloads at once" value={String(settings.concurrency)} onValueChange={(v) => void save({ concurrency: Number(v) })} options={['1', '2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v }))} />
        </Row>
        <Row id={ids.bw} label="Speed limit" hint="Shared by all downloads.">
          <SelectField id={ids.bw} className="w-44" value={String(settings.bandwidthLimitKib)} onValueChange={(v) => void save({ bandwidthLimitKib: Number(v) })} options={[{ value: '0', label: 'No limit' }, { value: '512', label: '512 KB/s' }, { value: '1024', label: '1 MB/s' }, { value: '5120', label: '5 MB/s' }, { value: '10240', label: '10 MB/s' }]} />
        </Row>
      </Group>

      <Group title="Notifications">
        {([['downloadComplete', 'Download finished', ids.n1], ['downloadFailed', 'Download failed', ids.n2], ['conversionComplete', 'Conversion finished', ids.n3], ['lowStorage', 'Not enough storage', ids.n4], ['browserLost', 'Browser connection lost', ids.n5]] as const).map(([k, label, id]) => (
          <Row key={k} id={id} label={label}>
            <Switch id={id} checked={settings.notifications[k]} onCheckedChange={(v) => void notif(k, v)} />
          </Row>
        ))}
      </Group>

      <Group title="App">
        {info?.autostartSupported ? (
          <Row id={ids.start} label="Open Downora when you log in" hint="Starts in the tray, ready for browser downloads.">
            <Switch id={ids.start} checked={settings.launchAtStartup} onCheckedChange={(v) => void save({ launchAtStartup: v })} />
          </Row>
        ) : null}
        <Row id={ids.tray} label="Keep running in the tray when the window is closed" hint="Quit from the tray icon’s menu.">
          <Switch id={ids.tray} checked={settings.minimizeToTray} onCheckedChange={(v) => void save({ minimizeToTray: v })} />
        </Row>
        <Row id={ids.bridge} label="Browser connection" hint="Accept downloads from paired browsers.">
          <Switch id={ids.bridge} checked={settings.browserBridge} onCheckedChange={(v) => void save({ browserBridge: v })} />
        </Row>
        <Row label="Appearance" hint="Downora uses a dark theme. A light theme isn’t available yet.">
          <span className="text-sm text-ink-muted">Dark</span>
        </Row>
      </Group>

      <Group title="Media">
        <Row label="FFmpeg" hint={info?.ffmpeg ? <span data-selectable>{info.ffmpeg.ffmpeg}</span> : 'Not found. Install FFmpeg to convert files and see video details.'}>
          <span className="text-sm text-ink-muted">{info?.ffmpeg ? `Version ${info.ffmpeg.version}` : 'Not installed'}</span>
        </Row>
      </Group>

      <Group title="About">
        <Row label={`Downora ${info?.version ?? ''}`} hint={info?.updates}>
          <span className="text-sm text-ink-muted capitalize">{info?.platform}</span>
        </Row>
      </Group>
    </>
  );
}
