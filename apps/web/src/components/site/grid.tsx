/**
 * The page's drafting-table structure: a framed sheet, two vertical rails,
 * hairline bands between sections and small accent crosses where lines meet.
 */
import { cn } from '@downora/ui';
import type { ReactNode } from 'react';

/** Accent "+" where two hairlines cross. Decorative. */
export function Cross({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('pointer-events-none absolute z-10 size-[9px]', className)}>
      <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-accent" />
      <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-accent" />
    </span>
  );
}

/** Light grey page with the site drawn on a rounded sheet in the middle. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-page p-0 sm:p-3">
      <div className="mx-auto min-h-[calc(100dvh-1.5rem)] max-w-[1440px] overflow-clip border-line bg-canvas sm:rounded-[1.25rem] sm:border">{children}</div>
    </div>
  );
}

/** The column between the two rails. */
export function Rails({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('relative mx-auto max-w-[1200px] border-line sm:border-x', className)}>{children}</div>;
}

/** A horizontal band: hairline on top, crosses where it meets the rails. */
export function Band({ children, className, id, line = true, label }: { children: ReactNode; className?: string; id?: string; line?: boolean; label?: string }) {
  return (
    <section id={id} aria-label={label} className={cn('relative scroll-mt-16', line && 'border-t border-line', className)}>
      {line ? (
        <>
          <Cross className="-top-[5px] -left-[5px] hidden sm:block" />
          <Cross className="-top-[5px] -right-[5px] hidden sm:block" />
        </>
      ) : null}
      {children}
    </section>
  );
}

/** Small mono pill above a heading. */
export function Tag({ children, className, tone = 'light' }: { children: ReactNode; className?: string; tone?: 'light' | 'dark' }) {
  return (
    <span
      className={cn(
        'tag-mono inline-flex items-center gap-2 rounded-[6px] border px-2 py-1',
        tone === 'light' ? 'border-line bg-surface text-ink-muted shadow-[0_1px_1px_rgb(0_0_0/0.03)]' : 'border-white/10 bg-white/[0.04] text-white/60',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

/** Headline in two tones: the first part in ink, the second in grey. */
export function TwoTone({ lead, rest, as: H = 'h2', className, invert }: { lead: ReactNode; rest: ReactNode; as?: 'h1' | 'h2'; className?: string; invert?: boolean }) {
  return (
    <H className={cn('font-semibold tracking-[-0.045em] text-balance', className)}>
      {invert ? (
        <>
          <span className="text-ink-ghost">{lead}</span> {rest}
        </>
      ) : (
        <>
          {lead} <span className="text-ink-ghost">{rest}</span>
        </>
      )}
    </H>
  );
}

// ───────────────────────── Dot matrix ─────────────────────────

/** 5×7 bitmap glyphs, one string per row. */
const FONT: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/**
 * Text drawn as a field of dots: lit dots spell the text, faint dots fill
 * the rest of the grid. Purely visual; pass the words as `label`.
 */
export function DotMatrix({
  text,
  label,
  className,
  scale = 2,
  pad = 3,
  padX = pad,
  tone = 'ink',
}: {
  text: string;
  label: string;
  className?: string;
  /** Dots per glyph pixel, per side. */
  scale?: number;
  pad?: number;
  padX?: number;
  tone?: 'ink' | 'dim';
}) {
  const chars = [...text.toUpperCase()].map((c) => FONT[c] ?? FONT[' ']!);
  const cols = (chars.length * 6 - 1) * scale + padX * 2;
  const rows = 7 * scale + pad * 2;
  const lit = new Set<string>();
  chars.forEach((g, i) =>
    g.forEach((row, y) =>
      [...row].forEach((bit, x) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) lit.add(`${padX + (i * 6 + x) * scale + dx},${pad + y * scale + dy}`);
      }),
    ),
  );
  const on: string[] = [];
  const off: string[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) (lit.has(`${x},${y}`) ? on : off).push(`M${x + 0.5} ${y + 0.5}h0`);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${cols} ${rows}`} className={cn('block h-auto w-full', className)} preserveAspectRatio="xMidYMid meet">
      <path d={off.join('')} strokeLinecap="round" strokeWidth={0.22} className={tone === 'ink' ? 'stroke-ink/15' : 'stroke-white/[0.07]'} />
      <path d={on.join('')} strokeLinecap="round" strokeWidth={0.72} className={tone === 'ink' ? 'stroke-ink' : 'stroke-white/25'} />
    </svg>
  );
}
