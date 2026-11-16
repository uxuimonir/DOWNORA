import { cva, type VariantProps } from 'class-variance-authority';
import { Label as LabelPrimitive, Separator as SeparatorPrimitive, Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps, HTMLAttributes, InputHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

// ─────────────────────────── Input ───────────────────────────

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full min-w-0 rounded-control border border-line-strong bg-canvas px-3 text-sm text-ink',
        'placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150',
        'hover:border-[#465066] focus-visible:border-violet focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-violet/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger aria-invalid:ring-danger/20',
        className,
      )}
      {...props}
    />
  );
}

// ─────────────────────────── Label ───────────────────────────

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm font-medium text-ink', className)}
      {...props}
    />
  );
}

// ─────────────────────────── Badge ───────────────────────────

export const badgeVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-line-strong bg-raised text-ink-muted',
        violet: 'border-violet/35 bg-violet/12 text-violet-soft',
        sky: 'border-sky/30 bg-sky/10 text-sky',
        success: 'border-success/30 bg-success/10 text-success',
        warn: 'border-warn/30 bg-warn/10 text-warn',
        danger: 'border-danger/35 bg-danger/10 text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Shows a small status dot before the label. */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

// ─────────────────────────── Panel ───────────────────────────

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` sits one step above the page surface. */
  level?: 'surface' | 'raised';
  ref?: Ref<HTMLDivElement>;
}

export function Panel({ className, level = 'surface', ...props }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-panel border border-line shadow-panel',
        level === 'surface' ? 'bg-surface' : 'bg-raised',
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-4 border-b border-line px-5 py-4', className)}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold tracking-normal text-ink', className)} {...props} />;
}

// ────────────────────────── Separator ──────────────────────────

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn('shrink-0 bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  );
}

// ─────────────────────────── Switch ───────────────────────────

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line-strong bg-raised p-0.5',
        'transition-colors duration-200 data-[state=checked]:border-violet data-[state=checked]:bg-violet-deep',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] rounded-full bg-ink-muted shadow-sm transition-transform duration-200 ease-out-quint data-[state=checked]:translate-x-5 data-[state=checked]:bg-white" />
    </SwitchPrimitive.Root>
  );
}

// ────────────────────────── Skeleton ──────────────────────────

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-raised', className)}
      {...props}
    />
  );
}

// ───────────────────────────── Kbd ─────────────────────────────

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-raised px-1.5 font-sans text-xs font-medium text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}
