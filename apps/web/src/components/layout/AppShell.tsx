import { cn, Logo, Sheet, SheetContent, SheetTrigger } from '@downora/ui';
import {
  ChevronRight,
  Clock3,
  Ellipsis,
  Film,
  House,
  Layers,
  LifeBuoy,
  ListOrdered,
  Music2,
  Settings2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useChrome } from '@/stores/chrome';
import { ThemeControl } from '@/components/site/Navigation';
import { useAccount } from '@/stores/account';
import { isActive, useDownloads } from '@/stores/downloads';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: 'active' | 'history';
}

const LIBRARY: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: House },
  { to: '/video', label: 'Video', icon: Film },
  { to: '/audio', label: 'Audio', icon: Music2 },
  { to: '/queue', label: 'Queue', icon: ListOrdered, count: 'active' },
  { to: '/history', label: 'History', icon: Clock3, count: 'history' },
  { to: '/sources', label: 'Supported sources', icon: Layers },
];

const ACCOUNT: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings2 },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/help', label: 'Help center', icon: LifeBuoy },
];

/** Bottom tab bar on phones — the four most-used places plus "More". */
const TABS: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: House },
  { to: '/video', label: 'Video', icon: Film },
  { to: '/audio', label: 'Audio', icon: Music2 },
  { to: '/queue', label: 'Queue', icon: ListOrdered, count: 'active' },
];

const MORE: NavItem[] = [
  { to: '/history', label: 'History', icon: Clock3 },
  { to: '/sources', label: 'Supported sources', icon: Layers },
  { to: '/settings', label: 'Settings', icon: Settings2 },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/help', label: 'Help center', icon: LifeBuoy },
];

function useCounts() {
  return useDownloads(
    useShallow((s) => ({
      active: s.jobs.filter((j) => j.status === 'downloading' || j.status === 'queued').length,
      history: s.jobs.filter((j) => !isActive(j)).length,
    })),
  );
}

// ───────────────────────── Desktop sidebar ─────────────────────────

function SidebarSection({ title, items }: { title: string; items: NavItem[] }) {
  const counts = useDownloads((s) => s.jobs);
  const active = counts.filter((j) => j.status === 'downloading' || j.status === 'queued').length;
  const history = counts.filter((j) => !isActive(j)).length;
  return (
    <div className="px-1 pb-5">
      <p className="tag-mono px-3 pb-2 text-ink-muted">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {items.map(({ to, label, icon: Icon, count }) => {
          const n = count === 'active' ? active : count === 'history' ? history : undefined;
          return (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive: on }) =>
                  cn(
                    'group flex h-9 items-center gap-3 rounded-[0.5rem] border px-3 text-[0.875rem] transition-colors',
                    on ? 'border-line bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.05)]' : 'border-transparent text-ink-muted hover:text-ink',
                  )
                }
              >
                {({ isActive: on }) => (
                  <>
                    <Icon className={cn('size-4', on ? 'text-accent-soft' : 'text-ink-muted group-hover:text-ink')} />
                    <span className="flex-1">{label}</span>
                    {n !== undefined ? (
                      <span className="tabular tag-mono text-ink-muted">
                        {count === 'active' && n > 0 ? <span className="sr-only">Active downloads: </span> : null}
                        {n}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────────── Phone tab bar ─────────────────────────

function TabBar() {
  const { active } = useCounts();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const moreActive = MORE.some((m) => location.pathname.startsWith(m.to));

  return (
    <nav aria-label="Main" className="material fixed inset-x-0 bottom-0 z-40 border-t border-edge pb-safe [background-color:color-mix(in_srgb,var(--color-canvas)_90%,transparent)] lg:hidden">
      <ul className="mx-auto grid h-[3.25rem] max-w-lg grid-cols-5">
        {TABS.map(({ to, label, icon: Icon, count }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive: on }) =>
                cn('relative flex h-full flex-col items-center justify-center gap-0.5 text-[0.625rem] font-medium', on ? 'text-accent-soft' : 'text-ink-muted')
              }
            >
              <Icon className="size-[22px]" strokeWidth={1.8} />
              {label}
              {count === 'active' && active > 0 ? (
                <span className="tabular absolute top-1 left-1/2 ml-2 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-danger px-1 text-[0.625rem] font-semibold text-white">
                  <span className="sr-only">Active downloads: </span>
                  {active}
                </span>
              ) : null}
            </NavLink>
          </li>
        ))}
        <li>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              className={cn(
                'flex h-full w-full flex-col items-center justify-center gap-0.5 text-[0.625rem] font-medium',
                moreActive ? 'text-accent-soft' : 'text-ink-muted',
              )}
            >
              <Ellipsis className="size-[22px]" strokeWidth={1.8} />
              More
            </SheetTrigger>
            <SheetContent title="More">
              <div className="flex items-center justify-between px-6 pt-4 pb-2">
                <p className="text-[1.0625rem] font-semibold">More</p>
                <ThemeControl />
              </div>
              <ul className="mx-4 mb-4 overflow-hidden rounded-panel border border-line bg-surface">
                {MORE.map(({ to, label, icon: Icon }) => (
                  <li key={to} className="border-b border-edge last:border-b-0">
                    <Link
                      to={to}
                      onClick={() => setMoreOpen(false)}
                      className="flex h-12 items-center gap-3.5 px-4 text-[1.0625rem] text-ink active:bg-hover"
                    >
                      <span className="grid size-7 place-items-center rounded-[0.5rem] border border-line bg-surface">
                        <Icon className="size-4 text-ink" />
                      </span>
                      <span className="flex-1">{label}</span>
                      <ChevronRight className="size-4 text-ink-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}

// ───────────────────────── Phone nav bar ─────────────────────────

/** Shows the logo at rest and the page title once the large title scrolls away. */
function NavBar() {
  const { title, collapsed } = useChrome(useShallow((s) => ({ title: s.title, collapsed: s.collapsed })));
  const showTitle = collapsed && Boolean(title);
  return (
    <header
      className={cn(
        'material sticky top-0 z-40 border-b pt-safe transition-colors duration-200 lg:hidden',
        showTitle ? 'border-edge' : 'border-transparent',
      )}
    >
      <div className="relative flex h-11 items-center justify-center px-4">
        <Link
          to="/"
          aria-label="Downora home"
          tabIndex={showTitle ? -1 : undefined}
          aria-hidden={showTitle || undefined}
          className={cn('flex min-h-11 items-center transition-opacity duration-200', showTitle && 'pointer-events-none opacity-0')}
        >
          <Logo className="[&_svg]:size-7 [&>span:last-child]:text-[1.0625rem]" />
        </Link>
        <p
          aria-hidden
          className={cn(
            'absolute inset-x-16 truncate text-center text-[1.0625rem] font-semibold tracking-[-0.02em] transition-[opacity,transform] duration-200',
            showTitle ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0',
          )}
        >
          {title}
        </p>
      </div>
    </header>
  );
}

// ───────────────────────── Shell ─────────────────────────

export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const initAccount = useAccount((s) => s.init);
  // Load the account once for every app page (history, profile, conversions).
  useEffect(() => {
    void initAccount();
  }, [initAccount]);

  // Move focus to the page on navigation so screen readers announce it —
  // unless the page already put focus somewhere useful (e.g. an autofocus field).
  useEffect(() => {
    const main = mainRef.current;
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[248px_1fr] lg:bg-page">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col p-3 pr-2 lg:flex">
        <div className="flex h-14 shrink-0 items-center px-3">
          <Link to="/" aria-label="Downora home">
            <Logo className="[&_svg]:size-6 [&>span:last-child]:text-[0.9375rem]" />
          </Link>
        </div>
        <nav aria-label="Main" className="mt-2 flex flex-1 flex-col overflow-y-auto">
          <div>
            <SidebarSection title="Library" items={LIBRARY} />
            <SidebarSection title="Account" items={ACCOUNT} />
          </div>
          <div className="mt-auto flex flex-col gap-3 px-3 pt-4">
            <ThemeControl />
            <p className="text-xs leading-relaxed text-ink-muted">Originals download in your browser. Conversions run on Downora’s server.</p>
          </div>
        </nav>
      </aside>

      <div className="min-w-0 lg:my-3 lg:mr-3 lg:rounded-[1.25rem] lg:border lg:border-line lg:bg-canvas">
        <NavBar />

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-[1120px] px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-16"
        >
          <Outlet />
        </main>
      </div>
      <TabBar />
      <ScrollRestoration />
    </div>
  );
}
