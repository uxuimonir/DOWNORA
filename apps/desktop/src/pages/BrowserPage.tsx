import { Badge, Button, ConfirmDialog, Panel, PanelHeader, PanelTitle, toast } from '@downora/ui';
import { AlertTriangle, Link2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageTitle } from '@/App';
import { ago } from '@/lib/format';
import { api, errorText } from '@/lib/ipc';
import { useApp } from '@/lib/store';

export function BrowserPage() {
  const { info, browsers, connected, settings, refreshBrowsers } = useApp();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [revoke, setRevoke] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const tick = () => {
      const s = Math.max(0, Math.round((Date.parse(code.expiresAt) - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) setCode(null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [code]);

  useEffect(() => {
    // A successful pairing closes the code window.
    if (code) setCode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browsers.length]);

  const start = async () => {
    try {
      setCode(await api.startPairing());
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <>
      <PageTitle title="Browser Integration" description="Pair the Downora Chrome extension so the downloads you start in Chrome are saved by this app." />
      {info?.bridgeError ? (
        <Panel role="alert" className="mb-6 flex gap-3 p-5">
          <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
          <p>{info.bridgeError}</p>
        </Panel>
      ) : null}
      {!settings?.browserBridge ? (
        <Panel className="mb-6 p-5 text-sm text-ink-muted">Browser connection is off. Turn it on in Settings to pair or receive downloads.</Panel>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <Panel className="p-6">
          <p className="label-mono">Pair a browser</p>
          {code ? (
            <div className="mt-4" aria-live="polite">
              <p className="text-sm text-ink-muted">In Chrome, open the Downora extension → Settings → Desktop app, and enter:</p>
              <p className="tabular mt-4 font-mono text-[3rem] leading-none font-medium tracking-[0.2em]" data-selectable data-testid="pair-code">
                {code.code}
              </p>
              <p className="mt-3 text-xs text-ink-faint">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. You’ll be asked to approve the browser here.</p>
              <Button className="mt-5" variant="ghost" onClick={() => void api.cancelPairing().then(() => setCode(null))}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-muted">Pairing creates a private key that only this app and your extension share. Nothing on the web can send downloads to Downora.</p>
              <Button variant="primary" className="mt-5" onClick={() => void start()} disabled={!settings?.browserBridge || Boolean(info?.bridgeError)}>
                <Link2 /> Pair a browser
              </Button>
            </>
          )}
        </Panel>

        <Panel className="p-6">
          <p className="label-mono">How it works</p>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm text-ink-muted">
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />Listens only on this computer (127.0.0.1:{info?.bridgePort}); other devices can’t connect.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />Every request is signed and used once; old or replayed requests are refused.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />Keys are kept in {info?.secretStorage} and rotate every 12 hours.</li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />If Downora isn’t running, the extension falls back to Chrome’s own downloads.</li>
          </ul>
        </Panel>
      </div>

      <Panel className="mt-6">
        <PanelHeader>
          <PanelTitle>Paired browsers</PanelTitle>
          <Badge tone={connected ? 'success' : 'neutral'} dot>
            {connected ? 'Connected' : 'Not connected'}
          </Badge>
        </PanelHeader>
        {browsers.length ? (
          <ul className="divide-y divide-line">
            {browsers.map((b) => (
              <li key={b.keyId} className="flex items-center gap-4 px-5 py-3.5" data-testid="paired-browser">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{b.clientName}</p>
                  <p className="truncate font-mono text-xs text-ink-faint" data-selectable>{b.origin}</p>
                </div>
                <p className="text-right text-xs text-ink-muted">
                  Paired {ago(b.pairedAt)}
                  <br />
                  {b.lastSeen ? `Last seen ${ago(b.lastSeen)}` : 'Not seen yet'}
                </p>
                <Button size="sm" variant="danger" onClick={() => setRevoke(b.keyId)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-ink-muted">No browsers paired yet.</p>
        )}
      </Panel>

      <ConfirmDialog
        open={Boolean(revoke)}
        onOpenChange={(o) => !o && setRevoke(null)}
        title="Remove this browser?"
        description="It will no longer be able to send downloads. You can pair it again any time."
        confirmLabel="Remove"
        destructive
        onConfirm={() => revoke && void api.revokeBrowser(revoke).then(refreshBrowsers)}
      />
    </>
  );
}
