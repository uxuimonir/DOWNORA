/**
 * Marketing sections. Every visual here either shows the real product (the
 * live downloader, real sample media, the real progress track) or is an
 * explanatory diagram — nothing pretends to be a working control.
 */
import { describeAdapters, EXCLUDED_SOURCES } from '@downora/source-adapters';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button, cn, Logo, LogoMark, TransferTrack } from '@downora/ui';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine,
  Ban,
  Check,
  CircleSlash,
  ClipboardPaste,
  Clock3,
  Eye,
  Film,
  Gauge,
  KeyRound,
  ListChecks,
  Lock,
  MousePointerClick,
  Music2,
  Pause,
  Puzzle,
  RotateCcw,
  ScanSearch,
  ServerCog,
  ShieldCheck,
  Waves,
} from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Downloader } from '@/components/downloader/Downloader';
import { Float, Reveal, spring } from './motion';
import { ThemeControl } from './Navigation';

const SAMPLE_VIDEO = `${import.meta.env.BASE_URL}samples/downora-sample-1080p.mp4`;

function SectionHeading({ title, children, align = 'left', className }: { title: ReactNode; children?: ReactNode; align?: 'left' | 'center'; className?: string }) {
  return (
    <Reveal className={cn(align === 'center' && 'mx-auto text-center', className)}>
      <h2 className={cn('text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-[3.5rem] lg:text-[4.25rem]', align === 'center' && 'mx-auto max-w-[16ch]', align === 'left' && 'max-w-[18ch]')}>
        {title}
      </h2>
      {children ? <p className={cn('mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-muted sm:text-xl', align === 'center' && 'mx-auto')}>{children}</p> : null}
    </Reveal>
  );
}

const Wrap = ({ children, className, id }: { children: ReactNode; className?: string; id?: string }) => (
  <section id={id} className={cn('scroll-mt-20', className)}>
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">{children}</div>
  </section>
);

// ───────────────────────── 2 · Hero (+3 · live downloader) ─────────────────────────

export function Hero() {
  return (
    <section className="relative isolate overflow-clip pt-14 pb-24 sm:pt-24 lg:pb-32">
      <div aria-hidden className="aurora -z-10" />
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <motion.h1
          initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto text-center text-[2.75rem] leading-[0.95] font-semibold tracking-[-0.055em] min-[400px]:text-[3.1rem] sm:text-[5.5rem] lg:text-[8rem]"
        >
          <span className="block">Your Media.</span>
          <span className="block whitespace-nowrap">One Click Away.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-7 max-w-[44ch] text-center text-lg leading-relaxed text-ink-muted sm:text-xl"
        >
          Download and manage supported video and audio content with a faster, simpler media experience.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={spring}>
            <Button variant="primary" size="lg" className="h-[3.25rem] px-7 text-base" asChild>
              <a href="#download">
                <ArrowDownToLine /> Start Downloading
              </a>
            </Button>
          </motion.div>
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={spring}>
            <Button size="lg" className="material h-[3.25rem] border-edge px-7 text-base" asChild>
              <a href="#extension">
                <Puzzle /> Get Chrome Extension
              </a>
            </Button>
          </motion.div>
        </motion.div>

        <div id="download" className="relative mx-auto mt-16 max-w-[1080px] scroll-mt-24 sm:mt-20">
          <Float className="absolute -top-5 -left-8 z-10 hidden 2xl:block" delay={0.4}>
            <span className="material flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium shadow-pop ring-1 ring-edge">
              <Film className="size-4 text-accent-soft" /> MP4 · 1080p
            </span>
          </Float>
          <Float className="absolute -top-5 -right-8 z-10 hidden 2xl:block" delay={1.2} distance={14}>
            <span className="material flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium shadow-pop ring-1 ring-edge">
              <Music2 className="size-4 text-info" /> Audio only · MP3
            </span>
          </Float>
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring, delay: 0.5 }}
            className="relative rounded-[2rem] border border-edge bg-surface/55 p-3 shadow-pop backdrop-blur-2xl sm:p-5"
          >
            <div className="mb-3 flex items-center gap-1.5 px-2 sm:mb-4" aria-hidden>
              <span className="size-3 rounded-full bg-line-strong" />
              <span className="size-3 rounded-full bg-line-strong" />
              <span className="size-3 rounded-full bg-line-strong" />
              <span className="ml-3 text-xs font-medium text-ink-muted">Downora · Paste a link to try it</span>
            </div>
            <Downloader size="lg" variant="stage" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── 4–7 · Anatomy: preview, quality, format, progress ─────────────────────────

function QualityLadder() {
  const tiers = ['8K', '4K', '2K', '1080p', '720p', '480p'];
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Quality tiers for a 1080p source">
      {tiers.map((t, i) => {
        const above = i < 3;
        return (
          <li key={t} className={cn('flex items-center justify-between rounded-control border px-3 py-2 text-sm', above ? 'border-dashed border-line text-ink-faint' : i === 3 ? 'border-accent bg-accent/12 font-semibold' : 'border-line bg-surface')}>
            <span className={cn(above && 'line-through decoration-1')}>{t}</span>
            <span className="text-xs text-ink-muted">{above ? 'Not in source' : i === 3 ? 'Source' : 'Scaled down'}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ProgressDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20%' });
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="flex flex-col gap-3" aria-hidden>
      <div className="flex items-end justify-between">
        <span className="text-sm text-ink-muted">launch-film.mp4</span>
        <motion.span className="tabular text-5xl leading-none font-light tracking-[-0.05em]" initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}>
          72%
        </motion.span>
      </div>
      <TransferTrack label="Example progress" value={inView || reduce ? 0.72 : 0} className="h-3 [&>div]:duration-[1600ms]" />
      <span className="tabular text-xs text-ink-muted">520 KB of 722 KB, 1.2 MB/s, 1 s left</span>
    </div>
  );
}

export function Anatomy() {
  const tile = 'relative overflow-hidden rounded-[1.75rem] border border-edge bg-surface p-6 shadow-panel sm:p-8';
  return (
    <Wrap className="py-24 sm:py-32">
      <SectionHeading title="Everything a download needs. Nothing it doesn’t.">
        The downloader above is built from four parts. Each one only shows what the file really has.
      </SectionHeading>
      <div className="mt-14 grid gap-4 lg:grid-cols-6">
        <Reveal className={cn(tile, 'lg:col-span-4')}>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
            <video src={SAMPLE_VIDEO} muted loop playsInline autoPlay preload="metadata" aria-label="Sample media preview" className="aspect-video w-full rounded-[1.25rem] bg-black object-cover ring-1 ring-edge motion-reduce:hidden" />
            <div>
              <Eye className="size-6 text-accent-soft" aria-hidden />
              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Media preview</h3>
              <p className="mt-2 text-ink-muted">Watch or listen before you save. Downora reads the real length, resolution and size from the file itself.</p>
            </div>
          </div>
        </Reveal>
        <Reveal className={cn(tile, 'lg:col-span-2')} delay={0.08}>
          <Gauge className="size-6 text-accent-soft" aria-hidden />
          <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Quality selector</h3>
          <p className="mt-2 mb-5 text-ink-muted">Never a fake 4K. Only the source quality and lower.</p>
          <QualityLadder />
        </Reveal>
        <Reveal className={cn(tile, 'lg:col-span-3')} delay={0.04}>
          <ListChecks className="size-6 text-accent-soft" aria-hidden />
          <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Format selector</h3>
          <p className="mt-2 text-ink-muted">Keep the original, or convert on Downora’s server.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2" aria-hidden>
            {[
              ['Video', ['MP4', 'WEBM', 'MKV'], Film],
              ['Audio', ['MP3', 'WAV', 'M4A'], Music2],
            ].map(([label, list, Icon]) => {
              const I = Icon as typeof Film;
              return (
                <div key={label as string} className="rounded-[1.25rem] bg-raised p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <I className="size-4 text-ink-muted" /> {label as string}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(list as string[]).map((f, i) => (
                      <span key={f} className={cn('rounded-control border px-3 py-1.5 text-sm font-semibold', i === 0 ? 'border-accent bg-accent/12' : 'border-line bg-surface')}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
        <Reveal className={cn(tile, 'lg:col-span-3')} delay={0.12}>
          <ArrowDownToLine className="size-6 text-accent-soft" aria-hidden />
          <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Download progress</h3>
          <p className="mt-2 mb-8 text-ink-muted">Counted from bytes that actually arrived, never estimated or animated for show.</p>
          <ProgressDemo />
        </Reveal>
      </div>
    </Wrap>
  );
}

// ───────────────────────── 8 · How it works ─────────────────────────

export function HowItWorks() {
  const steps = [
    { icon: ClipboardPaste, title: 'Paste or detect', body: 'Paste a direct file link, or let the extension find supported media on the page you’re watching.' },
    { icon: ScanSearch, title: 'Pick what’s real', body: 'Choose video or audio, a format and a quality, from options the file actually offers.' },
    { icon: ArrowDownToLine, title: 'Save it', body: 'The original downloads in your browser. Conversions run on Downora’s server, then download to you.' },
  ];
  return (
    <Wrap id="how" className="border-y border-line bg-surface/50 py-24 sm:py-32">
      <SectionHeading title="Three steps. No detours." align="center" />
      <div className="relative mt-16">
      <div aria-hidden className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent md:block" />
      <ol className="relative grid gap-12 md:grid-cols-3 md:gap-8">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i * 0.1} className="relative text-center">
              <span className="relative mx-auto grid size-14 place-items-center rounded-full border border-edge bg-canvas shadow-panel">
                <s.icon className="size-6 text-accent-soft" aria-hidden />
              </span>
              <p className="tabular mt-6 text-sm font-semibold text-ink-muted">Step {i + 1}</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-[32ch] text-ink-muted">{s.body}</p>
            </Reveal>
        ))}
      </ol>
      </div>
    </Wrap>
  );
}

// ───────────────────────── 9 · Chrome extension ─────────────────────────

function BrowserMock() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-25%' });
  return (
    <div ref={ref} className="relative rounded-[1.75rem] border border-edge bg-surface shadow-pop" aria-hidden>
      <div className="flex h-11 items-center gap-1.5 border-b border-line px-4">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 h-6 flex-1 rounded-full bg-raised" />
        <span className="ml-2 grid size-7 place-items-center rounded-md bg-raised">
          <LogoMark className="size-4" />
        </span>
      </div>
      <div className="p-4 sm:p-6">
        <div className="relative aspect-video overflow-hidden rounded-[1.25rem] bg-black">
          <video src={SAMPLE_VIDEO} muted loop playsInline autoPlay preload="metadata" className="size-full object-cover opacity-90 motion-reduce:hidden" />
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={inView ? { scale: 1, opacity: 1 } : {}}
            transition={{ ...spring, delay: 0.3 }}
            className="material absolute top-3 right-3 grid size-11 place-items-center rounded-full shadow-pop ring-1 ring-white/20"
          >
            <LogoMark className="size-7" />
          </motion.span>
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{ ...spring, delay: 0.75 }}
            className="material absolute top-16 right-3 w-[min(260px,72%)] rounded-[1.25rem] p-3 shadow-pop ring-1 ring-edge"
          >
            <p className="text-sm font-semibold text-ink">Launch film</p>
            <p className="text-xs text-ink-muted">example.com · 0:08 · 1920 × 1080</p>
            <div className="mt-2 flex flex-col gap-1 text-xs">
              <span className="flex items-center justify-between rounded-lg bg-accent/15 px-2.5 py-2 text-ink">
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-accent-soft" /> MP4 · 1080p
                </span>
                <span className="text-ink-muted">722 KB</span>
              </span>
              <span className="flex items-center justify-between px-2.5 py-2 text-ink-muted">
                <span>WEBM · 720p</span>
                <span>261 KB</span>
              </span>
            </div>
            <span className="mt-2 block rounded-full bg-ink py-2 text-center text-xs font-semibold text-canvas">Download video</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function ExtensionShowcase() {
  const points = [
    { icon: ScanSearch, t: 'Finds media as pages load', d: 'Including players that appear later.' },
    { icon: MousePointerClick, t: 'One button on the player', d: 'Top corner, clear of the controls, styled in its own Shadow DOM.' },
    { icon: KeyRound, t: 'Asks per site', d: 'No access to any site until you turn it on.' },
    { icon: Clock3, t: 'History that syncs', d: 'Sign in and your downloads show up in the web app too.' },
  ];
  return (
    <Wrap id="extension" className="py-24 sm:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div>
          <SectionHeading title="Downora, right on the player.">
            The Chrome extension spots supported video and audio on the page you’re watching and puts a small Downora button on it.
          </SectionHeading>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {points.map((p, i) => (
              <Reveal as="li" key={p.t} delay={i * 0.06}>
                  <p.icon className="size-5 text-accent-soft" aria-hidden />
                  <p className="mt-3 font-semibold">{p.t}</p>
                  <p className="mt-1 text-sm text-ink-muted">{p.d}</p>
                </Reveal>
            ))}
          </ul>
          <Reveal className="mt-10 rounded-[1.25rem] border border-line bg-surface p-5 text-sm">
            <p className="font-semibold">Install it (developer preview)</p>
            <p className="mt-1 text-ink-muted">
              It isn’t on the Chrome Web Store yet. Build it with <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">pnpm ext:build</code>, open{' '}
              <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">chrome://extensions</code>, turn on Developer mode, and load the{' '}
              <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">apps/extension/dist</code> folder.
            </p>
            <Button variant="link" className="mt-3" asChild>
              <a href="https://github.com/uxuimonir/downora/tree/main/apps/extension" target="_blank" rel="noreferrer noopener">
                Read the install guide
              </a>
            </Button>
          </Reveal>
        </div>
        <Reveal>
          <BrowserMock />
          <p className="mt-3 text-center text-sm text-ink-muted">How the extension looks on a page with a supported video.</p>
        </Reveal>
      </div>
    </Wrap>
  );
}

// ───────────────────────── 10 · Supported sources ─────────────────────────

export function SupportedSources({ outputs }: { outputs: string[] }) {
  const rows = [
    { f: 'MP4', kind: 'Video', ext: '.mp4, .m4v' },
    { f: 'WebM', kind: 'Video', ext: '.webm' },
    { f: 'MP3', kind: 'Audio', ext: '.mp3' },
    { f: 'M4A', kind: 'Audio', ext: '.m4a' },
    { f: 'WAV', kind: 'Audio', ext: '.wav' },
  ];
  const conv = (kind: string) =>
    outputs.length
      ? outputs.filter((o) => (kind === 'Audio' ? ['mp3', 'wav', 'm4a'].includes(o) : true)).map((o) => o.toUpperCase()).join(', ')
      : 'Needs Downora’s server';
  const adapters = describeAdapters().filter((a) => a.status === 'available');
  return (
    <Wrap id="sources" className="border-t border-line py-24 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <SectionHeading title="Supported sources, plainly.">
          Direct links to media files on any site. Downora reads the file type from the link or what the server reports, then checks the bytes.
        </SectionHeading>
        <Reveal>
          <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-surface">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">Supported file types</caption>
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th scope="col" className="px-5 py-4 font-medium">Format</th>
                  <th scope="col" className="px-5 py-4 font-medium">Type</th>
                  <th scope="col" className="px-5 py-4 font-medium">Recognized by</th>
                  <th scope="col" className="px-5 py-4 font-medium">Can become</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.f} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-5 py-4 text-base font-semibold">{r.f}</th>
                    <td className="px-5 py-4 text-ink-muted">{r.kind}</td>
                    <td className="px-5 py-4 text-ink-muted">{r.ext} or its MIME type</td>
                    <td className="px-5 py-4 text-ink-muted">{conv(r.kind)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-ink-muted">
            {adapters.length} source types are live today.{' '}
            <Link to="/sources" className="font-medium text-accent-soft hover:underline">
              See the full list
            </Link>
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {EXCLUDED_SOURCES.map((x) => (
              <li key={x.name} className="flex gap-3 text-sm">
                <CircleSlash className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span>
                  <span className="font-medium">{x.name}.</span> <span className="text-ink-muted">Not supported.</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Wrap>
  );
}

// ───────────────────────── 11–13 · Features ─────────────────────────

/** A two-column feature with a visual; `flip` swaps the sides. */
export function FeatureSection({ id, title, body, items, visual, flip }: { id?: string; title: string; body: string; items: { icon: typeof Film; t: string; d: string }[]; visual: ReactNode; flip?: boolean }) {
  return (
    <Wrap id={id} className="py-20 sm:py-28">
      <div className={cn('grid items-center gap-12 lg:grid-cols-2 lg:gap-20', flip && 'lg:[&>*:first-child]:order-2')}>
        <Reveal>{visual}</Reveal>
        <div>
          <SectionHeading title={title}>{body}</SectionHeading>
          <ul className="mt-10 flex flex-col divide-y divide-line border-y border-line">
            {items.map((it, i) => (
              <Reveal as="li" key={it.t} delay={i * 0.05} className="flex gap-4 py-5">
                  <it.icon className="mt-0.5 size-5 shrink-0 text-accent-soft" aria-hidden />
                  <div>
                    <p className="font-semibold">{it.t}</p>
                    <p className="mt-1 text-sm text-ink-muted">{it.d}</p>
                  </div>
                </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </Wrap>
  );
}

export function VideoVisual() {
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(60%_60%_at_30%_30%,rgb(139_92_246/0.35),transparent_70%),radial-gradient(50%_50%_at_80%_80%,rgb(56_189_248/0.3),transparent_70%)] blur-2xl" />
      <video src={SAMPLE_VIDEO} muted loop playsInline autoPlay preload="metadata" aria-label="Sample video" className="aspect-video w-full rounded-[1.75rem] bg-black object-cover shadow-pop ring-1 ring-edge motion-reduce:hidden" />
      <div className="aspect-video w-full rounded-[1.75rem] bg-[linear-gradient(135deg,rgb(139_92_246/0.5),rgb(56_189_248/0.4))] motion-safe:hidden" aria-hidden />
      <div className="material absolute -bottom-5 left-5 flex items-center gap-3 rounded-full px-4 py-2.5 text-sm shadow-pop ring-1 ring-edge">
        <Badge tone="accent">1080p</Badge> 1920 × 1080 · 0:08 · H.264
      </div>
    </div>
  );
}

export function AudioVisual() {
  const reduce = useReducedMotion();
  const bars = Array.from({ length: 48 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)));
  return (
    <div className="rounded-[1.75rem] border border-edge bg-surface p-6 shadow-pop sm:p-8" aria-hidden>
      <div className="flex items-center gap-3">
        <span className="accent-gradient grid size-12 place-items-center rounded-2xl">
          <Music2 className="size-6 text-white" />
        </span>
        <div>
          <p className="font-semibold">Podcast episode 12</p>
          <p className="text-sm text-ink-muted">MP3 · 0:12 · 188 KB</p>
        </div>
      </div>
      <div className="mt-8 flex h-28 items-center gap-[3px]">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-full bg-gradient-to-t from-accent to-info"
            style={{ height: `${h * 100}%`, transformOrigin: 'center' }}
            animate={reduce ? undefined : { scaleY: [1, 0.55 + (i % 5) * 0.08, 1] }}
            transition={{ duration: 2.4 + (i % 7) * 0.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.03 }}
          />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {['MP3', 'WAV', 'M4A'].map((f) => (
          <span key={f} className="rounded-control border border-line bg-raised px-3 py-1.5 text-sm font-semibold">
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

export function QueueVisual() {
  const rows = [
    { name: 'launch-film.mp4', state: 'Downloading', v: 0.64, s: 'active' as const, meta: '462 KB of 722 KB' },
    { name: 'interview.webm', state: 'Paused', v: 0.31, s: 'paused' as const, meta: 'Resumes from 68 KB' },
    { name: 'theme-song.mp3', state: 'Saved', v: 1, s: 'done' as const, meta: '188 KB' },
  ];
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {rows.map((r, i) => (
        <motion.div
          key={r.name}
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ ...spring, delay: i * 0.12 }}
          className={cn('rounded-[1.25rem] border border-edge bg-surface p-5 shadow-panel', i === 1 && 'lg:ml-10', i === 2 && 'lg:ml-20')}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-medium">{r.name}</p>
            <Badge tone={r.s === 'done' ? 'success' : r.s === 'paused' ? 'warn' : 'accent'} dot>
              {r.state}
            </Badge>
          </div>
          <TransferTrack className="mt-3" label={r.name} value={r.v} state={r.s} size="sm" />
          <p className="tabular mt-2 text-xs text-ink-muted">{r.meta}</p>
        </motion.div>
      ))}
    </div>
  );
}

export const VIDEO_ITEMS = [
  { icon: ScanSearch, t: 'Real resolution', d: 'Read from the stream with FFprobe. 4K is shown only when the file is 4K.' },
  { icon: Gauge, t: 'Scale down, never up', d: 'Turn a 1080p file into 720p or 480p. Upscaling isn’t offered.' },
  { icon: Film, t: 'MP4, WebM and MKV', d: 'Keep the original, or convert on Downora’s server when you’re signed in.' },
];
export const AUDIO_ITEMS = [
  { icon: Music2, t: 'Audio from video', d: 'Pull the soundtrack out of a video as MP3, WAV or M4A.' },
  { icon: Waves, t: 'Original audio files', d: 'Save MP3, M4A and WAV links exactly as they are.' },
  { icon: Check, t: 'Checked output', d: 'Every converted file is read back to make sure it plays.' },
];
export const QUEUE_ITEMS = [
  { icon: Pause, t: 'Pause and resume', d: 'Continues from the same byte when the server allows it, and says so when it doesn’t.' },
  { icon: RotateCcw, t: 'Retry and cancel', d: 'A dropped connection is a button press away from finishing.' },
  { icon: Clock3, t: 'History', d: 'Search what you saved. Signed in, it follows you to the extension too.' },
];

// ───────────────────────── 14 · Privacy & security ─────────────────────────

export function Privacy() {
  const points = [
    { icon: Lock, t: 'No DRM bypass', d: 'Protected streams are never touched. Not now, not as a setting.' },
    { icon: ShieldCheck, t: 'No borrowed sign-ins', d: 'Downora never reads cookies or signs in to other sites for you.' },
    { icon: ServerCog, t: 'Guarded server', d: 'Every link the server fetches is checked against private networks, at each redirect.' },
    { icon: Ban, t: 'Files expire', d: 'Converted files are deleted from the server within an hour.' },
  ];
  return (
    <section id="privacy" className="scroll-mt-20 bg-[#08090d] py-24 text-[#f8fafc] sm:py-32 [color-scheme:dark]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="max-w-[14ch] text-[2.75rem] leading-[0.98] font-semibold tracking-[-0.05em] sm:text-[4.5rem] lg:text-[6rem]">Nothing to hide. Nothing hidden.</h2>
          <p className="mt-6 max-w-[50ch] text-lg text-[#a7b4c8] sm:text-xl">Downora saves media you’re allowed to have, and is open about how.</p>
        </Reveal>
        <ul className="mt-16 grid gap-px overflow-hidden rounded-[1.75rem] bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((p, i) => (
            <Reveal as="li" key={p.t} delay={i * 0.06} className="bg-[#0f1219] p-7">
                <p.icon className="size-6 text-[#b4a0fb]" aria-hidden />
                <p className="mt-5 text-lg font-semibold">{p.t}</p>
                <p className="mt-2 text-sm text-[#a7b4c8]">{p.d}</p>
              </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ───────────────────────── 15 · FAQ ─────────────────────────

const FAQS = [
  ['What links work?', 'Direct links to MP4, WebM, MP3, M4A or WAV files. A link to a page that plays a video isn’t a file link; the extension finds the file for you on supported pages.'],
  ['Why can’t I pick 4K?', 'Downora only lists qualities the file really has. A 1080p file can become 720p or 480p, but never 4K.'],
  ['Do I need an account?', 'No, to save original files. Converting (to MP3, MKV and so on) runs on Downora’s server and needs a free account.'],
  ['Does it work on streaming sites?', 'Not on ones that use DRM or adaptive streaming. Downora never bypasses protection or signs in for you.'],
  ['What happens to converted files?', 'They’re stored only until you download them, and deleted within an hour either way.'],
  ['Is the extension on the Chrome Web Store?', 'Not yet. You can load it in developer mode today; the guide is on GitHub.'],
] as const;

export function FAQ() {
  return (
    <Wrap id="faq" className="py-24 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading title="Questions, answered.">
            More in the{' '}
            <Link to="/help" className="font-medium text-accent-soft hover:underline">
              Help center
            </Link>
            .
          </SectionHeading>
        </div>
        <Reveal>
          <Accordion type="single" collapsible className="border-t border-line">
            {FAQS.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="py-6 text-lg">{q}</AccordionTrigger>
                <AccordionContent className="text-base">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </Wrap>
  );
}

// ───────────────────────── 16 · Final CTA ─────────────────────────

export function FinalCTA() {
  return (
    <Wrap className="pb-24 sm:pb-32">
      <Reveal className="relative isolate overflow-hidden rounded-[2.25rem] px-6 py-16 text-center sm:px-12 sm:py-24">
        <div aria-hidden className="aurora aurora-strong -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 border border-edge bg-surface/40 backdrop-blur-xl [border-radius:inherit]" />
        <h2 className="mx-auto max-w-[14ch] text-[2.75rem] leading-[0.98] font-semibold tracking-[-0.05em] sm:text-[4.5rem]">Your next file is one paste away.</h2>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="primary" size="lg" className="h-[3.25rem] px-7 text-base" asChild>
            <a href="#download">
              <ArrowDownToLine /> Start Downloading
            </a>
          </Button>
          <Button size="lg" className="material h-[3.25rem] border-edge px-7 text-base" asChild>
            <Link to="/sign-in">Create a free account</Link>
          </Button>
        </div>
      </Reveal>
    </Wrap>
  );
}

// ───────────────────────── 17 · Footer ─────────────────────────

export function Footer() {
  const cols: [string, [string, string][]][] = [
    ['Product', [['Downloader', '/video'], ['Audio', '/audio'], ['Supported sources', '/sources'], ['Dashboard', '/dashboard']]],
    ['Account', [['Sign in', '/sign-in'], ['Profile', '/profile'], ['History', '/history'], ['Settings', '/settings']]],
    ['Help', [['Help center', '/help'], ['Privacy & security', '/#privacy'], ['FAQ', '/#faq']]],
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-[30ch] text-sm text-ink-muted">Download and manage the media you’re allowed to save. No DRM bypass, ever.</p>
          <ThemeControl className="mt-6" />
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <p className="text-sm font-semibold">{title}</p>
            <ul className="mt-4 flex flex-col">
              {links.map(([label, to]) => (
                <li key={label}>
                  {to.startsWith('/#') ? (
                    <a href={to.slice(1)} className="inline-flex min-h-10 items-center text-sm text-ink-muted hover:text-ink">
                      {label}
                    </a>
                  ) : (
                    <Link to={to} className="inline-flex min-h-10 items-center text-sm text-ink-muted hover:text-ink">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1280px] px-4 py-6 text-xs text-ink-muted sm:px-6 lg:px-8">© 2026 Downora. Original design; not affiliated with any media platform.</p>
      </div>
    </footer>
  );
}
