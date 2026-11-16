import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[2.125rem] leading-tight font-bold tracking-[-0.03em] sm:text-[2.75rem] sm:font-semibold">{title}</h1>
        {description ? <p className="mt-2 max-w-[62ch] text-[0.9375rem] text-ink-muted sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
