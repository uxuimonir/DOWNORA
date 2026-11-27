import { useEffect, useRef, type ReactNode } from 'react';
import { Tag } from '@/components/site/grid';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useChrome } from '@/stores/chrome';

/**
 * iOS large title. When it scrolls under the navigation bar, the bar shows the
 * title instead, as UINavigationBar does.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const setChrome = useChrome((s) => s.set);
  useDocumentTitle(title);

  useEffect(() => {
    setChrome({ title, collapsed: false });
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setChrome({ collapsed: !entry?.isIntersecting }),
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      setChrome({ title: '', collapsed: false });
    };
  }, [title, setChrome]);

  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Tag className="mb-4 hidden sm:inline-flex">Downora · {title}</Tag>
        <h1
          ref={ref}
          className="text-[2rem] leading-tight font-semibold tracking-[-0.045em] sm:text-[2.75rem]"
        >
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-[62ch] text-[0.9375rem] text-ink-muted sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
