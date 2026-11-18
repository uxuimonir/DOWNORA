import { Button, Logo, Sheet, SheetContent, SheetTrigger, ThemeSwitcher } from '@downora/ui';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAccount } from '@/stores/account';
import { useSettings } from '@/stores/settings';

const LINKS = [
  { href: '#download', label: 'Download' },
  { href: '#how', label: 'How it works' },
  { href: '#extension', label: 'Extension' },
  { href: '#features', label: 'Features' },
  { href: '#faq', label: 'FAQ' },
];

export function ThemeControl({ className }: { className?: string }) {
  const theme = useSettings((s) => s.settings.theme);
  const update = useSettings((s) => s.update);
  return <ThemeSwitcher value={theme} onChange={(t) => update({ theme: t })} className={className} />;
}

export function Navigation() {
  const { scrollY } = useScroll();
  const border = useTransform(scrollY, [0, 40], [0, 1]);
  const [open, setOpen] = useState(false);
  const signedIn = useAccount((s) => s.status === 'signed_in');

  return (
    <header className="sticky top-0 z-50 pt-safe">
      <motion.div style={{ opacity: border }} className="material pointer-events-none absolute inset-0 border-b border-edge" aria-hidden />
      <div className="relative mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Downora home" className="flex min-h-11 items-center">
          <Logo />
        </Link>
        <nav aria-label="Site" className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="rounded-full px-3.5 py-2 text-sm text-ink transition-colors hover:bg-fill">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeControl className="hidden sm:inline-flex" />
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link to={signedIn ? '/profile' : '/sign-in'}>{signedIn ? 'Account' : 'Sign in'}</Link>
          </Button>
          <Button variant="primary" size="sm" asChild>
            <Link to="/dashboard">Open app</Link>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="lg:hidden">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent title="Menu">
              <nav aria-label="Site menu" className="px-4 pt-4 pb-2">
                <ul className="overflow-hidden rounded-panel bg-cell">
                  {LINKS.map((l) => (
                    <li key={l.href} className="border-b border-line last:border-b-0">
                      <a href={l.href} onClick={() => setOpen(false)} className="flex h-12 items-center px-4 text-[1.0625rem] active:bg-fill">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between gap-3 px-1">
                  <ThemeControl />
                  <Button variant="secondary" asChild>
                    <Link to={signedIn ? '/profile' : '/sign-in'} onClick={() => setOpen(false)}>
                      {signedIn ? 'Account' : 'Sign in'}
                    </Link>
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
