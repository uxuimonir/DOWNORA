import { useId, type HTMLAttributes, type SVGProps } from 'react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';
import { cn } from '../lib/cn';

// ─────────────────────────── Logo ───────────────────────────

/**
 * The Downora mark: a "D" whose bowl is cut by a descending arrow that lands on
 * a tray — the file arriving on disk.
 */
export function LogoMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('size-8', className)} aria-hidden {...props}>
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F36444" />
          <stop offset="1" stopColor="#E5502F" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9.5" fill={`url(#${id}-g)`} />
      <path
        d="M10 7.5h6.2c4.9 0 8.3 3.4 8.3 8.1 0 2.3-.8 4.3-2.2 5.8"
        stroke="#0B0D12"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M10 7.5v10.2" stroke="#0B0D12" strokeWidth="2.6" strokeLinecap="round" />
      <path
        d="M16 12.5v8.2m0 0-3.4-3.4m3.4 3.4 3.4-3.4"
        stroke="#0B0D12"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.5 24.6h13" stroke="#0B0D12" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} {...props}>
      <LogoMark />
      <span className="text-[1.1875rem] font-semibold tracking-[-0.03em] text-ink">Downora</span>
    </span>
  );
}

// ─────────────────────── TransferTrack ───────────────────────

export interface TransferTrackProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–1. Omit (or pass `null`) when the total size is unknown. */
  value?: number | null;
  /** Visual state. `active` animates; the rest are static. */
  state?: 'active' | 'paused' | 'done' | 'failed' | 'idle';
  label: string;
  size?: 'sm' | 'md';
}

/**
 * Downora's signature progress bar. The bar is cut into segments so progress
 * reads as blocks of data arriving, like a buffer filling.
 */
export function TransferTrack({
  value,
  state = 'active',
  label,
  size = 'md',
  className,
  ...props
}: TransferTrackProps) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const fraction = known ? Math.min(1, Math.max(0, value)) : 0;
  const indeterminate = !known && state === 'active';

  const fill =
    state === 'failed'
      ? 'bg-danger'
      : state === 'done'
        ? 'bg-success'
        : state === 'paused'
          ? 'bg-ink-faint'
          : 'bg-accent';

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(fraction * 100) : undefined}
      aria-valuetext={known ? `${Math.round(fraction * 100)}%` : indeterminate ? 'In progress' : undefined}
      className={cn(
        'track-segments relative w-full overflow-hidden bg-white/10',
        size === 'sm' ? 'h-1.5' : 'h-2.5',
        className,
      )}
      {...props}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 left-0 w-2/5 animate-track-sweep bg-accent" />
      ) : (
        <div
          className={cn('absolute inset-y-0 left-0 transition-[width] duration-300 ease-out', fill)}
          style={{ width: `${(state === 'done' ? 1 : fraction) * 100}%` }}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Toaster ───────────────────────────

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="top-center"
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-[1.125rem] !border !border-white/8 !bg-[#232323]/90 !backdrop-blur-xl !text-ink !shadow-pop !font-sans !text-sm',
          description: '!text-ink-muted',
          actionButton: '!bg-ink !text-canvas !rounded-full !font-medium',
          cancelButton: '!bg-hover !text-ink !rounded-md',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
        },
      }}
      {...props}
    />
  );
}
