import type { FileNamePattern, MotionPreference } from '@downora/types';
import { Button, ConfirmDialog, Panel, SegmentedControl, SelectField, Switch, toast } from '@downora/ui';
import { useId, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ThemeControl } from '@/components/site/Navigation';
import { buildFileName } from '@/lib/format';
import { useSettings } from '@/stores/settings';

function Row({
  label,
  description,
  control,
  htmlFor,
  inline,
}: {
  label: string;
  description: ReactNode;
  control: ReactNode;
  htmlFor?: string;
  /** Keep the control beside the text on phones too, as iOS does for switches. */
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? 'flex items-center justify-between gap-4 px-5 py-4 sm:gap-8'
          : 'flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8'
      }
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium text-ink">{label}</p>
        )}
        <p className="mt-0.5 max-w-[56ch] text-[0.8125rem] text-ink-muted">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="label-mono mb-2 px-4">{title}</h2>
      <Panel className="divide-y divide-line">{children}</Panel>
    </section>
  );
}

export function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  const autoId = useId();
  const notifyId = useId();
  const patternId = useId();
  const sizeId = useId();
  const historyId = useId();

  const example = buildFileName({
    baseName: 'launch-trailer',
    container: 'mp4',
    qualityLabel: '1080p',
    pattern: settings.fileNamePattern,
  });

  const toggleNotify = async (next: boolean) => {
    if (!next) return update({ notifyOnComplete: false });
    if (typeof Notification === 'undefined') {
      toast.error('This browser doesn’t support notifications');
      return;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission === 'granted') {
      update({ notifyOnComplete: true });
      toast.success('Notifications on', { description: 'You’ll hear from Downora when a download finishes in the background.' });
    } else {
      toast.error('Notifications are blocked', { description: 'Allow notifications for this site in your browser settings, then try again.' });
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Changes save automatically and apply to this browser." />

      <Section title="Downloads">
        <Row
          label="Downloads at once"
          description="More parallel downloads finish a batch sooner but share your bandwidth."
          control={
            <SegmentedControl
              aria-label="Downloads at once"
              value={String(settings.concurrency) as '1' | '2' | '3' | '4'}
              onValueChange={(v) => update({ concurrency: Number(v) })}
              options={(['1', '2', '3', '4'] as const).map((v) => ({ value: v, label: v }))}
            />
          }
        />
        <Row
          inline
          htmlFor={autoId}
          label="Start downloads right away"
          description="When off, new downloads wait in the queue until you press Resume."
          control={<Switch id={autoId} checked={settings.autoStart} onCheckedChange={(v) => update({ autoStart: v })} />}
        />
        <Row
          htmlFor={patternId}
          label="File names"
          description={
            <>
              Example: <span className="text-ink">{example}</span>
            </>
          }
          control={
            <SelectField<FileNamePattern>
              id={patternId}
              className="w-56"
              value={settings.fileNamePattern}
              onValueChange={(v) => update({ fileNamePattern: v })}
              options={[
                { value: 'original', label: 'Original name' },
                { value: 'with-quality', label: 'Name with quality' },
                { value: 'with-date', label: 'Name with date' },
              ]}
            />
          }
        />
        <Row
          htmlFor={sizeId}
          label="Largest file in the browser"
          description="The browser holds a file in memory until it’s saved. Bigger files can be fetched by Downora’s server when you’re signed in."
          control={
            <SelectField
              id={sizeId}
              className="w-40"
              value={String(settings.maxBrowserFileMb)}
              onValueChange={(v) => update({ maxBrowserFileMb: Number(v) })}
              options={[
                { value: '256', label: '256 MB' },
                { value: '512', label: '512 MB' },
                { value: '1024', label: '1 GB' },
                { value: '2048', label: '2 GB' },
              ]}
            />
          }
        />
      </Section>

      <Section title="Notifications and display">
        <Row
          inline
          htmlFor={notifyId}
          label="Notify when a download finishes"
          description="Only when Downora is in a background tab. Your browser will ask for permission."
          control={<Switch id={notifyId} checked={settings.notifyOnComplete} onCheckedChange={(v) => void toggleNotify(v)} />}
        />
        <Row
          label="Theme"
          description="“System” follows your device’s light or dark setting."
          control={<ThemeControl />}
        />
        <Row
          label="Motion"
          description="“System” follows your device’s reduced-motion setting."
          control={
            <SegmentedControl<MotionPreference>
              aria-label="Motion"
              value={settings.motion}
              onValueChange={(v) => update({ motion: v })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'reduce', label: 'Reduced' },
                { value: 'full', label: 'Full' },
              ]}
            />
          }
        />
      </Section>

      <Section title="History">
        <Row
          htmlFor={historyId}
          label="Keep in history"
          description="Older entries are removed once the list is full. Saved files are not affected."
          control={
            <SelectField
              id={historyId}
              className="w-40"
              value={String(settings.historyLimit)}
              onValueChange={(v) => update({ historyLimit: Number(v) })}
              options={[
                { value: '50', label: '50 items' },
                { value: '200', label: '200 items' },
                { value: '500', label: '500 items' },
              ]}
            />
          }
        />
      </Section>

      <Button variant="ghost" onClick={() => setConfirmReset(true)}>
        Restore default settings
      </Button>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Restore default settings?"
        description="Your history and saved files are kept. Only the options on this page change."
        confirmLabel="Restore defaults"
        onConfirm={() => {
          reset();
          toast.success('Settings restored');
        }}
      />
    </>
  );
}
