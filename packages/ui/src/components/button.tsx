import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none',
    'rounded-full font-medium tracking-[-0.01em] transition-[background-color,border-color,color,opacity,transform] duration-150',
    'active:scale-[0.97] active:opacity-80 disabled:pointer-events-none disabled:opacity-40',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-ink text-canvas hover:bg-white',
        tinted: 'bg-accent/15 text-accent-soft hover:bg-accent/22',
        secondary: 'border border-line-strong bg-raised text-ink hover:bg-hover',
        ghost: 'text-ink-muted hover:bg-raised hover:text-ink',
        outline: 'border border-line-strong text-ink hover:bg-raised',
        danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
        link: 'h-auto rounded-sm px-0 text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3.5 text-[0.8125rem] [&_svg]:size-3.5',
        md: 'h-10 px-[1.125rem] text-[0.9375rem] [&_svg]:size-4',
        lg: 'h-[3.125rem] px-6 text-[1.0625rem] font-semibold [&_svg]:size-[18px]',
        icon: 'size-9 [&_svg]:size-4',
        'icon-sm': 'size-8 [&_svg]:size-4',
      },
    },
    compoundVariants: [{ variant: 'link', class: 'h-auto px-0' }],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
