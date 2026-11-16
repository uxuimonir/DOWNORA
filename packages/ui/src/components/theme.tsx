import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { SegmentedControl } from './overlays';

export type ThemePref = 'system' | 'light' | 'dark';

/** Resolves a preference to the theme to show right now. */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Keeps <html data-theme> in sync with the preference and the OS. */
export function useApplyTheme(pref: ThemePref) {
  useEffect(() => {
    const apply = () => {
      const t = resolveTheme(pref);
      const root = document.documentElement;
      root.dataset.theme = t;
      root.style.colorScheme = t;
      root.style.background = '';
    };
    apply();
    if (pref !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}

export function ThemeSwitcher({
  value,
  onChange,
  size = 'sm',
  className,
}: {
  value: ThemePref;
  onChange: (v: ThemePref) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <SegmentedControl<ThemePref>
      aria-label="Theme"
      size={size}
      className={className}
      value={value}
      onValueChange={onChange}
      options={[
        { value: 'system', label: <Monitor aria-hidden />, ariaLabel: 'Match system theme' },
        { value: 'light', label: <Sun aria-hidden />, ariaLabel: 'Light theme' },
        { value: 'dark', label: <Moon aria-hidden />, ariaLabel: 'Dark theme' },
      ]}
    />
  );
}
