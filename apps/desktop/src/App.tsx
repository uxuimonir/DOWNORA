import { Button, cn, Logo, Toaster, TooltipProvider } from '@downora/ui';
import {
  AlertTriangle,
  ArrowDownToLine,
  Clock3,
  Gauge,
  ListOrdered,
  Puzzle,
  Settings2,
  ShieldCheck,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { api } from './lib/ipc';
import { useApp } from './lib/store';
import { BrowserPage } from './pages/BrowserPage';
import { ConverterPage } from './pages/ConverterPage';
import { DownloaderPage } from './pages/DownloaderPage';
import { HistoryPage } from './pages/HistoryPage';
import { OverviewPage } from './pages/OverviewPage';
import { QueuePage } from './pages/QueuePage';
import { SettingsPage } from './pages/SettingsPage';

export type { PageId } from './lib/store';
import type { PageId } from './lib/store';

const NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'downloader', label: 'Downloader', icon: ArrowDownToLine },
  { id: 'queue', label: 'Download Queue', icon: ListOrdered },
  { id: 'history', label: 'History', icon: Clock3 },
  { id: 'converter', label: 'Media Converter', icon: Wand2 },
  { id: 'browser', label: 'Browser Integration', icon: Puzzle },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export function App() {
  const { ready, loadError, init, jobs, conversions, connected, browsers, page, go: setPage } = useApp();

  useEffect(() => {
    void init();
  }, [init]);

  const active = jobs.filter((j) => j.status === 'downloading' || j.status === 'queued').length;
  const converting = conversions.filter((c) => c.status === 'running').length;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full bg-canvas text-ink">
        <aside className="flex w-[244px] shrink-0 flex-col border-r border-line bg-surface/70">
          {/* Space for macOS traffic lights; also the window drag handle. */}
          <div data-tauri-drag-region className="flex h-14 shrink-0 items-end px-5 pb-1">
            <Logo className="pointer-events-none [&_svg]:size-7 [&>span:last-child]:text-[1.0625rem]" />
          </div>
          <nav aria-label="Main" className="mt-4 flex-1 px-3">
            <p className="label-mono px-2.5 pb-2">Library</p>
            <ul className="flex flex-col gap-0.5">
              {NAV.map(({ id, label, icon: Icon }) => {
                const count = id === 'queue' ? active : id === 'converter' ? converting : 0;
                const on = page === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setPage(id)}
                      aria-current={on ? 'page' : undefined}
                      className={cn(
                        'flex h-9 w-full items-center gap-3 rounded-control border px-2.5 text-left text-sm transition-colors',
                        on ? 'border-line-strong bg-raised text-ink' : 'border-transparent text-ink-muted hover:bg-raised/60 hover:text-ink',
                      )}
                    >
                      <Icon className={cn('size-[17px]', on ? 'text-accent' : 'text-ink-faint')} aria-hidden />
                      <span className="flex-1">{label}</span>
                      {count > 0 ? (
                        <span className="tabular font-mono text-[0.6875rem] text-accent">
                          <span className="sr-only">Active: </span>
                          {count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="border-t border-line px-5 py-4 text-xs text-ink-muted">
            <p className="flex items-center gap-2">
              <span className={cn('size-2 rounded-full', connected ? 'bg-success' : browsers.length ? 'bg-ink-faint' : 'bg-line-strong')} aria-hidden />
              {connected ? 'Browser connected' : browsers.length ? 'Browser not connected' : 'No browser paired'}
            </p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div data-tauri-drag-region className="h-10 shrink-0" />
          <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-12">
            {!ready ? (
              <p className="mt-10 text-ink-muted" role="status">
                Starting Downora…
              </p>
            ) : loadError ? (
              <div role="alert" className="mt-10 flex max-w-lg gap-3 rounded-panel border border-danger/30 bg-danger/10 p-5">
                <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
                <p>{loadError}</p>
              </div>
            ) : (
              <>
                {page === 'overview' && <OverviewPage go={setPage} />}
                {page === 'downloader' && <DownloaderPage go={setPage} />}
                {page === 'queue' && <QueuePage go={setPage} />}
                {page === 'history' && <HistoryPage go={setPage} />}
                {page === 'converter' && <ConverterPage />}
                {page === 'browser' && <BrowserPage />}
                {page === 'settings' && <SettingsPage />}
              </>
            )}
          </div>
        </main>
      </div>
      <PairApproval />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

/** A browser asked to pair: the user must explicitly approve it. */
function PairApproval() {
  const { pairRequest, clearPairRequest } = useApp();
  if (!pairRequest) return null;
  const extId = pairRequest.origin.replace('chrome-extension://', '');
  const decide = async (approve: boolean) => {
    await api.decidePairing(pairRequest.requestId, approve).catch(() => false);
    clearPairRequest();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-[3px]">
      <div role="alertdialog" aria-modal="true" aria-labelledby="pair-title" aria-describedby="pair-desc" className="w-[22rem] overflow-hidden rounded-[1.125rem] border border-white/10 bg-[#232323] text-center shadow-pop">
        <div className="px-6 pt-6 pb-5">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent/15">
            <ShieldCheck className="size-6 text-accent" aria-hidden />
          </span>
          <h2 id="pair-title" className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]">
            Allow {pairRequest.clientName} to send downloads?
          </h2>
          <p id="pair-desc" className="mt-1.5 text-[0.8125rem] leading-snug text-ink-muted">
            The Downora extension (ID <span className="font-mono text-ink" data-selectable>{extId.slice(0, 8)}…{extId.slice(-4)}</span>) entered your pairing code. Only allow it if you just did that.
          </p>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10 text-[1.0625rem]">
          <button type="button" className="h-11 border-r border-white/10 text-accent hover:bg-white/5" onClick={() => void decide(false)}>
            Don’t allow
          </button>
          <button type="button" className="h-11 font-semibold text-accent hover:bg-white/5" onClick={() => void decide(true)} autoFocus>
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.03em]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-[60ch] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-panel border border-line bg-surface px-6 py-14 text-center">
      <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
      {children ? <p className="mt-1.5 max-w-[46ch] text-sm text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export { Button };
