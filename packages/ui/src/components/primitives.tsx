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
        'h-11 w-full min-w-0 rounded-control border border-line bg-surface px-3.5 text-[0.9375rem] text-ink',
        'placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150',
        'hover:border-line-strong focus-visible:border-accent/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15',
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
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[0.6875rem] font-medium tracking-[0.06em] uppercase whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-line-strong bg-raised text-ink-muted',
        solid: 'border-transparent bg-hover text-ink',
        accent: 'border-accent/35 bg-accent/12 text-accent-soft',
        sky: 'border-info/30 bg-info/10 text-info',
        success: 'border-success/25 bg-success/10 text-success',
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
      className={cn('flex min-h-12 items-center justify-between gap-4 border-b border-line px-5 py-3', className)}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('label-mono', className)} {...props} />;
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
        'hit-area peer inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full bg-[#39393d] p-[2px]',
        'transition-colors duration-200 data-[state=checked]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_3px_1px_rgb(0_0_0/0.06)] transition-transform duration-200 ease-out-quint data-[state=checked]:translate-x-5" />
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
