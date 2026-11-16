import { cn } from '@downora/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
  level = 2,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Use 1 when the empty state is the whole page. */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-panel border border-line bg-surface px-6 py-14 text-center',
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full border border-line-strong bg-raised">
        <Icon className="size-5 text-ink-muted" aria-hidden />
      </span>
      <Heading className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</Heading>
      {children ? <p className="mt-1.5 max-w-[48ch] text-sm text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
