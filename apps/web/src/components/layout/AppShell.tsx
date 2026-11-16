import {
  Button,
  cn,
  Logo,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from '@downora/ui';
import {
  Clock3,
  Film,
  Gauge,
  Layers,
  LifeBuoy,
  ListOrdered,
  Menu,
  Music2,
  Settings2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useDownloads } from '@/stores/downloads';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/video', label: 'Video', icon: Film },
  { to: '/audio', label: 'Audio', icon: Music2 },
  { to: '/queue', label: 'Queue', icon: ListOrdered },
  { to: '/history', label: 'History', icon: Clock3 },
  { to: '/sources', label: 'Supported sources', icon: Layers },
];

const SECONDARY: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings2 },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/help', label: 'Help center', icon: LifeBuoy },
];

function useActiveCount(): number {
  return useDownloads((s) => s.jobs.filter((j) => j.status === 'downloading' || j.status === 'queued').length);
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const active = useActiveCount();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors',
                isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:bg-raised/60 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <span className="accent-gradient absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full" aria-hidden />
                ) : null}
                <Icon className={cn('size-[18px]', isActive ? 'text-violet-soft' : 'text-ink-faint group-hover:text-ink-muted')} />
                <span className="flex-1">{label}</span>
                {to === '/queue' && active > 0 ? (
                  <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-violet/20 px-1.5 text-2xs font-semibold text-violet-soft">
                    <span className="sr-only">Active downloads: </span>
                    {active}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link to="/" onClick={onNavigate} aria-label="Downora home">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pt-2 pb-4">
        <NavList items={PRIMARY} onNavigate={onNavigate} />
        <div className="mt-auto">
          <NavList items={SECONDARY} onNavigate={onNavigate} />
        </div>
      </nav>
      <div className="border-t border-line px-5 py-4 text-xs leading-relaxed text-ink-faint">
        Downloads run in this browser. Nothing is uploaded.
      </div>
    </>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to the page on navigation so screen readers announce it.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-violet-deep px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface/60 lg:flex">
        <SidebarBody />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur-md lg:hidden">
          <Link to="/" aria-label="Downora home">
            <Logo />
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent title="Navigation">
              <SidebarBody onNavigate={() => setOpen(false)} />
              <SheetClose className="sr-only">Close menu</SheetClose>
            </SheetContent>
          </Sheet>
        </header>

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-16 outline-none sm:px-6 lg:px-10 lg:pt-10"
        >
          <Outlet />
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
}
