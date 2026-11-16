import { describeAdapters, EXCLUDED_SOURCES, matchUrl, validateMediaUrl } from '@downora/source-adapters';
import type { AdapterStatus } from '@downora/types';
import { Badge, Button, Input, Panel, type BadgeProps } from '@downora/ui';
import { Ban, CheckCircle2, CircleSlash, FlaskConical } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';

const STATUS: Record<AdapterStatus, { label: string; tone: BadgeProps['tone'] }> = {
  available: { label: 'Available', tone: 'success' },
  limited: { label: 'Limited', tone: 'warn' },
  planned: { label: 'Planned', tone: 'violet' },
};

const PERMISSION: Record<string, string> = {
  'direct-file': 'Public file link',
  'user-owned': 'Your own files',
  'licensed-api': 'Permitted API',
};

export function SourcesPage() {
  const adapters = describeAdapters();
  return (
    <>
      <PageHeader
        title="Supported sources"
        description="Downora only adds a source when downloading from it is allowed. This list is the full set; nothing else is supported yet."
      />

      <LinkChecker />

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {adapters.map((adapter) => (
          <Panel key={adapter.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-sans text-base font-semibold tracking-normal [font-variation-settings:normal]">{adapter.name}</h2>
              <Badge tone={STATUS[adapter.status].tone} dot>
                {STATUS[adapter.status].label}
              </Badge>
            </div>
            <p className="mt-1.5 text-sm text-ink-muted">{adapter.summary}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {adapter.formats.map((f) => (
                <span key={f} className="rounded-md border border-line-strong px-2 py-0.5 text-xs font-semibold text-ink">
                  {f.toUpperCase()}
                </span>
              ))}
            </div>
            <dl className="mt-5 flex flex-col gap-3 border-t border-line pt-4 text-sm">
              <div>
                <dt className="text-ink-faint">Detects by</dt>
                <dd className="mt-0.5 text-ink-muted">{adapter.detection.join('; ')}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Reads</dt>
                <dd className="mt-0.5 text-ink-muted">{adapter.metadata.join('; ')}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Why it’s allowed</dt>
                <dd className="mt-0.5 text-ink-muted">
                  <span className="text-ink">{PERMISSION[adapter.permission]}.</span> {adapter.permissionNote}
                </dd>
              </div>
              {adapter.statusNote ? (
                <div>
                  <dt className="text-ink-faint">Status</dt>
                  <dd className="mt-0.5 text-ink-muted">{adapter.statusNote}</dd>
                </div>
              ) : null}
            </dl>
          </Panel>
        ))}
      </div>

      <h2 className="mt-12 text-2xl font-semibold">What Downora won’t download</h2>
      <p className="mt-2 max-w-[62ch] text-ink-muted">
        These limits are deliberate. They protect creators and keep Downora within the rules of the sites you use.
      </p>
      <ul className="mt-5 grid gap-3 md:grid-cols-3">
        {EXCLUDED_SOURCES.map((item) => (
          <li key={item.name} className="rounded-panel border border-line bg-surface/50 p-5">
            <Ban className="size-5 text-danger" aria-hidden />
            <p className="mt-3 font-medium">{item.name}</p>
            <p className="mt-1 text-sm text-ink-muted">{item.reason}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function LinkChecker() {
  const id = useId();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<null | { ok: boolean; title: string; body: string; href?: string }>(null);

  const check = (e: FormEvent) => {
    e.preventDefault();
    const validation = validateMediaUrl(value);
    if (!validation.ok) {
      setResult({ ok: false, title: 'Not a valid link', body: validation.message });
      return;
    }
    const match = matchUrl(validation.url);
    if (!match) {
      setResult({
        ok: false,
        title: 'Not supported by its address alone',
        body: 'This link doesn’t end in a supported file type. If it points at a file, analyzing it will check the type the server reports.',
        href: `/video?url=${encodeURIComponent(validation.url.href)}`,
      });
      return;
    }
    setResult({
      ok: true,
      title: `Looks like a ${match.container.toUpperCase()} ${match.kind} file`,
      body: 'Handled by the direct file source. Analyze it to read its details.',
      href: `/${match.kind}?url=${encodeURIComponent(validation.url.href)}`,
    });
  };

  return (
    <Panel className="p-5">
      <form onSubmit={check} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
            <FlaskConical className="size-4 text-sky" aria-hidden />
            Check a link
          </label>
          <Input
            id={id}
            className="mt-2"
            placeholder="https://example.com/file.mp4"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setResult(null);
            }}
          />
        </div>
        <Button type="submit">Check</Button>
      </form>
      {result ? (
        <div className="mt-4 flex gap-3 text-sm" role="status">
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleSlash className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          )}
          <div>
            <p className="font-medium text-ink">{result.title}</p>
            <p className="mt-0.5 text-ink-muted">{result.body}</p>
            {result.href ? (
              <Link to={result.href} className="mt-1.5 inline-block text-violet-soft hover:underline">
                Analyze this link
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
