/**
 * Marketing sections on a drafting-table grid: rails, hairline bands, accent
 * crosses, mono tags and two-tone headlines. Every visual either is the real
 * product (the live downloader, real sample media) or is a labelled
 * illustration; nothing pretends to be a working control.
 */
import { describeAdapters, EXCLUDED_SOURCES } from '@downora/source-adapters';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button, cn, IconTile, LogoMark, TransferTrack } from '@downora/ui';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowRight,
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
import { Band, Cross, DotMatrix, Tag, TwoTone } from './grid';
import { spring } from './motion';

const SAMPLE_VIDEO = `${import.meta.env.BASE_URL}samples/downora-sample-1080p.mp4`;

type Item = { icon: typeof Film; t: string; d: string };

/** The sample clip. Plays muted on loop; with Reduce Motion it shows a still frame. */
function SampleVideo({ className, label }: { className?: string; label?: string }) {
  const reduce = useReducedMotion();
  return (
    <video
      src={`${SAMPLE_VIDEO}#t=1`}
      muted
      loop
      playsInline
      autoPlay={!reduce}
      preload="auto"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    />
  );
}

const H2 = 'text-[2rem] leading-[1.05] sm:text-[2.75rem] lg:text-[3.25rem]';

/** Centered tag + two-tone headline used to open a band. */
function Opener({ tag, lead, rest, children }: { tag: string; lead: ReactNode; rest: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-5 pt-16 pb-12 text-center sm:px-10 sm:pt-20">
      <Tag>{tag}</Tag>
      <TwoTone lead={lead} rest={rest} className={cn('mx-auto mt-5 max-w-[20ch]', H2)} />
      {children ? <p className="mx-auto mt-4 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-muted">{children}</p> : null}
    </div>
  );
}

/** A row of equal cells split by hairlines. */
function Cells({ children, cols = 4, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cn(
        'grid divide-y divide-line sm:divide-y-0',
        cols === 4 && 'sm:grid-cols-2 sm:[&>*:nth-child(n+3)]:border-t lg:grid-cols-4 lg:[&>*:nth-child(n+3)]:border-t-0 [&>*]:border-line sm:[&>*+*]:border-l sm:[&>*:nth-child(3)]:border-l-0 lg:[&>*:nth-child(3)]:border-l',
        cols === 3 && 'sm:grid-cols-3 [&>*]:border-line sm:[&>*+*]:border-l',
        cols === 2 && 'sm:grid-cols-2 [&>*]:border-line sm:[&>*+*]:border-l',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Cell({ icon, title, children, as: H = 'h3', extra }: { icon: ReactNode; title: string; children: ReactNode; as?: 'h3' | 'p'; extra?: ReactNode }) {
  return (
    <div className="flex flex-col p-5 sm:p-7">
      <IconTile>{icon}</IconTile>
      <H className="mt-5 text-[0.9375rem] font-semibold tracking-[-0.01em]">{title}</H>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-muted">{children}</p>
      {extra ? <div className="mt-5">{extra}</div> : null}
    </div>
  );
}

// ───────────────────────── 2 · Hero (+3 · live downloader) ─────────────────────────

export function Hero() {
  const reduce = useReducedMotion();
  const enter = (delay: number, y = 14) => (reduce ? {} : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } });
  return (
    <Band line={false} label="Downora">
      <div className="px-5 pt-16 pb-14 text-center sm:px-10 sm:pt-24">
        <motion.div {...enter(0)}>
          <Tag>Direct files · Up to 8K · No DRM bypass</Tag>
        </motion.div>
        <motion.div {...enter(0.06, 20)}>
          <TwoTone
            as="h1"
            invert
            lead={<span className="block">Your Media.</span>}
            rest={<span className="block whitespace-nowrap">One Click Away.</span>}
            className="mx-auto mt-6 text-[2.6rem] leading-[1] min-[400px]:text-[3rem] sm:text-[4.5rem] lg:text-[5.5rem]"
          />
        </motion.div>
        <motion.p {...enter(0.12)} className="mx-auto mt-6 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-muted sm:text-base">
          Download and manage supported video and audio content with a faster, simpler media experience.
        </motion.p>
        <motion.div {...enter(0.18)} className="mx-auto mt-8 flex max-w-xs flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
          <Button variant="primary" size="lg" className="h-11 px-5 text-[0.9375rem]" asChild>
            <a href="#download">
              <ArrowDownToLine /> Start Downloading
            </a>
          </Button>
          <Button variant="secondary" size="lg" className="h-11 px-5 text-[0.9375rem]" asChild>
            <a href="#extension">
              <Puzzle /> Get Chrome Extension
            </a>
          </Button>
        </motion.div>
      </div>

      {/* The live downloader, sitting in its own cell of the grid. */}
      <div className="relative border-t border-line">
        <Cross className="-top-[5px] -left-[5px] hidden sm:block" />
        <Cross className="-top-[5px] -right-[5px] hidden sm:block" />
        <div className="grid lg:grid-cols-[1fr_minmax(0,820px)_1fr]">
          <div aria-hidden className="hidden lg:block" />
          <motion.div
            id="download"
            {...(reduce ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: 0.26 } })}
            className="relative scroll-mt-24 border-line p-4 sm:p-8 lg:border-x"
          >
            <Cross className="-top-[5px] -left-[5px] hidden lg:block" />
            <Cross className="-top-[5px] -right-[5px] hidden lg:block" />
            <Cross className="-bottom-[5px] -left-[5px] hidden lg:block" />
            <Cross className="-right-[5px] -bottom-[5px] hidden lg:block" />
            <Downloader size="lg" variant="stage" />
          </motion.div>
          <div aria-hidden className="hidden lg:block" />
        </div>
      </div>
    </Band>
  );
}

// ───────────────────────── 8 · How it works (steps strip) ─────────────────────────

export function HowItWorks() {
  const steps: Item[] = [
    { icon: ClipboardPaste, t: 'Copy a file link', d: 'Or let the extension find media on the page you’re on.' },
    { icon: ScanSearch, t: 'Paste it, pick what’s real', d: 'Only formats and qualities the file has.' },
    { icon: ArrowDownToLine, t: 'Save it', d: 'The original, or a conversion from Downora’s server.' },
  ];
  return (
    <Band id="how">
      <div className="grid divide-y divide-line md:grid-cols-4 md:divide-x md:divide-y-0">
        <div className="flex items-center p-5 sm:px-7">
          <h2 className="text-[1.25rem] leading-tight font-semibold tracking-[-0.03em]">
            Three steps. <span className="text-ink-muted">No detours.</span>
          </h2>
        </div>
        {steps.map((s, i) => (
          <div key={s.t} className="flex items-start gap-3.5 p-5 sm:px-7">
            <IconTile>
              <s.icon />
            </IconTile>
            <div>
              <p className="tag-mono text-accent-soft">0{i + 1}</p>
              <h3 className="mt-0.5 text-[0.875rem] font-semibold">{s.t}</h3>
              <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
    </Band>
  );
}

// ───────────────────────── 4–7 · Anatomy ─────────────────────────

function ProgressDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20%' });
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="rounded-[0.625rem] border border-line bg-surface p-3" aria-hidden>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[0.75rem] font-medium">launch-film.mp4</span>
        <span className="tabular text-[1.125rem] font-semibold tracking-[-0.03em]">72%</span>
      </div>
      <TransferTrack label="Example progress" value={inView || reduce ? 0.72 : 0} className="mt-2 h-2 [&>div]:duration-[1600ms]" />
      <p className="tabular mt-1.5 text-[0.6875rem] text-ink-muted">106 KB of 147 KB</p>
    </div>
  );
}

const Mini = ({ items, pick }: { items: string[]; pick: number }) => (
  <ul className="overflow-hidden rounded-[0.625rem] border border-line bg-surface text-[0.75rem]" aria-hidden>
    {items.map((t, i) => (
      <li key={t} className={cn('flex items-center justify-between px-3 py-1.5', i > 0 && 'border-t border-line', i < pick && 'text-ink-faint line-through decoration-1')}>
        <span className={cn(i === pick && 'font-semibold')}>{t}</span>
        {i === pick ? <Check className="size-3.5 text-accent-soft" strokeWidth={2.6} /> : null}
      </li>
    ))}
  </ul>
);

export function Anatomy() {
  return (
    <Band id="why">
      <Opener tag="Why Downora" lead="Everything a download needs." rest="Nothing it doesn’t.">
        The downloader above is built from four parts. Each one only shows what the file really has.
      </Opener>
      <div className="relative border-t border-line">
        <Cross className="-top-[5px] -left-[5px] hidden sm:block" />
        <Cross className="-top-[5px] -right-[5px] hidden sm:block" />
        <Cells>
          <Cell icon={<Eye />} title="Media preview" extra={<SampleVideo className="aspect-video w-full rounded-[0.625rem] border border-line bg-black object-cover" label="Sample media preview" />}>
            Watch or listen first. Length, resolution and size come from the file itself.
          </Cell>
          <Cell icon={<Gauge />} title="Quality selector" extra={<Mini items={['4K', '2K', '1080p', '720p']} pick={2} />}>
            Never a fake 4K. Only the source quality and lower.
          </Cell>
          <Cell icon={<ListChecks />} title="Format selector" extra={<Mini items={['MP4', 'WEBM', 'MP3']} pick={0} />}>
            Keep the original, or convert on Downora’s server.
          </Cell>
          <Cell icon={<ArrowDownToLine />} title="Download progress" extra={<ProgressDemo />}>
            Counted from bytes that arrived. Never animated for show.
          </Cell>
        </Cells>
      </div>
    </Band>
  );
}

// ───────────────────────── 11 · Video: dot-matrix 8K ─────────────────────────

export const VIDEO_ITEMS: Item[] = [
  { icon: ScanSearch, t: 'Real resolution', d: 'Read from the stream with FFprobe. 4K is shown only when the file is 4K.' },
  { icon: Gauge, t: 'Scale down, never up', d: 'Turn a 1080p file into 720p or 480p. Upscaling isn’t offered.' },
  { icon: Film, t: 'MP4, WebM and MKV', d: 'Keep the original, or convert on Downora’s server when you’re signed in.' },
];

export function VideoQuality() {
  return (
    <Band id="quality">
      <Opener tag="Video" lead="Video, at the quality" rest="it really is." />
      <div className="px-5 pb-10 sm:px-10">
        <DotMatrix text="8K" scale={3} pad={4} padX={26} label="8K" />
        <p className="mt-5 text-center">
          <span className="tag-mono inline-block rounded-full border border-line bg-surface px-3 py-1 text-ink-muted">Highest tier listed · only when the source is 8K</span>
        </p>
      </div>
      <div className="relative border-t border-line">
        <Cross className="-top-[5px] -left-[5px] hidden sm:block" />
        <Cross className="-top-[5px] -right-[5px] hidden sm:block" />
        <Cells cols={3}>
          {VIDEO_ITEMS.map((it) => (
            <Cell key={it.t} icon={<it.icon />} title={it.t} as="p">
              {it.d}
            </Cell>
          ))}
        </Cells>
      </div>
    </Band>
  );
}

// ───────────────────────── Stats ─────────────────────────

export function Stats() {
  const stats: [string, string, string][] = [
    ['8', 'K', 'highest quality listed'],
    ['6', '', 'formats in and out'],
    ['0', '', 'ads or trackers'],
    ['1', 'h', 'max time a converted file is kept'],
  ];
  return (
    <Band label="Downora in numbers">
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {stats.map(([n, unit, label], i) => (
          <div key={label} className={cn('flex flex-col-reverse border-line p-5 sm:p-7', i % 2 === 1 && 'border-l', i > 1 && 'border-t lg:border-t-0', i === 2 && 'lg:border-l')}>
            <dt className="mt-1 text-[0.75rem] text-ink-muted">{label}</dt>
            <dd className="tabular text-[2.25rem] leading-none font-semibold tracking-[-0.04em]">
              {n}
              {unit ? <span className="text-accent-soft">{unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </Band>
  );
}

// ───────────────────────── 9 · Chrome extension ─────────────────────────

function BrowserMock() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-25%' });
  return (
    <div ref={ref} className="overflow-hidden rounded-[0.875rem] border border-line bg-surface shadow-panel" aria-hidden>
      <div className="flex h-9 items-center gap-1.5 border-b border-line px-3">
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="ml-2 flex h-6 flex-1 items-center rounded-md bg-raised px-2.5 text-[0.6875rem] text-ink-muted">example.com/launch</span>
        <span className="grid size-6 place-items-center rounded-md bg-raised">
          <LogoMark className="size-3.5" />
        </span>
      </div>
      <div className="p-3">
        <div className="relative aspect-video overflow-hidden rounded-[0.625rem] bg-black">
          <SampleVideo className="size-full object-cover" />
          <motion.span initial={{ scale: 0, opacity: 0 }} animate={inView ? { scale: 1, opacity: 1 } : {}} transition={{ ...spring, delay: 0.3 }} className="absolute top-2.5 right-2.5 grid size-9 place-items-center rounded-full bg-white shadow-pop">
            <LogoMark className="size-6 [--color-logo-ink:#fff] [--color-logo:#000]" />
          </motion.span>
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{ ...spring, delay: 0.7 }}
            className="absolute top-14 right-2.5 w-[min(230px,72%)] rounded-[0.75rem] border border-line bg-surface p-2.5 text-ink shadow-pop"
          >
            <p className="text-[0.8125rem] font-semibold">Launch film</p>
            <p className="tag-mono text-ink-muted">0:08 · 1920 × 1080</p>
            <div className="mt-2 overflow-hidden rounded-md border border-line text-[0.75rem]">
              <span className="flex items-center justify-between px-2.5 py-1.5">
                <span className="font-semibold">MP4 1080p</span>
                <span className="flex items-center gap-1 text-ink-muted">
                  147 KB <Check className="size-3 text-accent-soft" strokeWidth={2.6} />
                </span>
              </span>
              <span className="flex items-center justify-between border-t border-line px-2.5 py-1.5">
                <span>WEBM 720p</span>
                <span className="text-ink-muted">126 KB</span>
              </span>
            </div>
            <span className="mt-2 block rounded-md bg-accent-fill py-1.5 text-center text-[0.75rem] font-semibold text-white">Download video</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function ExtensionShowcase() {
  const points: Item[] = [
    { icon: ScanSearch, t: 'Finds media as pages load', d: 'Including players that appear later.' },
    { icon: MousePointerClick, t: 'One button on the player', d: 'Top corner, clear of the controls, in its own Shadow DOM.' },
    { icon: KeyRound, t: 'Asks per site', d: 'No access to any site until you turn it on.' },
    { icon: Clock3, t: 'History that syncs', d: 'Sign in and downloads show up in the web app too.' },
  ];
  return (
    <Band id="extension">
      <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-line">
        <div className="px-5 py-14 sm:px-10 sm:py-16">
          <Tag>Chrome extension</Tag>
          <TwoTone lead="Downora, right" rest="on the player." className={cn('mt-5', H2)} />
          <p className="mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-muted">
            The extension spots supported video and audio on the page you’re watching and puts a small Downora button on it.
          </p>
          <ul className="mt-8 border-t border-line">
            {points.map((p) => (
              <li key={p.t} className="flex items-start gap-3.5 border-b border-line py-3.5">
                <IconTile>
                  <p.icon />
                </IconTile>
                <div>
                  <p className="text-[0.875rem] font-semibold">{p.t}</p>
                  <p className="text-[0.8125rem] text-ink-muted">{p.d}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[0.8125rem] leading-relaxed text-ink-muted">
            <span className="font-medium text-ink">Developer preview.</span> Not on the Chrome Web Store yet: build it with{' '}
            <code className="rounded bg-raised px-1 py-0.5 font-mono text-[0.75rem] text-ink">pnpm ext:build</code> and load{' '}
            <code className="rounded bg-raised px-1 py-0.5 font-mono text-[0.75rem] text-ink">apps/extension/dist</code> in{' '}
            <code className="rounded bg-raised px-1 py-0.5 font-mono text-[0.75rem] text-ink">chrome://extensions</code>.{' '}
            <a href="https://github.com/uxuimonir/downora/tree/main/apps/extension" target="_blank" rel="noreferrer noopener" className="font-medium text-accent-soft hover:underline">
              Install guide
            </a>
          </p>
        </div>
        <div className="flex flex-col justify-center border-t border-line bg-[radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:14px_14px] px-5 py-14 sm:px-10 lg:border-t-0">
          <BrowserMock />
          <p className="tag-mono mt-3 text-center text-ink-muted">Illustration · a page with a supported video</p>
        </div>
      </div>
    </Band>
  );
}

// ───────────────────────── 10 · Supported sources ─────────────────────────

export function SupportedSources({ outputs }: { outputs: string[] }) {
  const formats = [
    { f: 'MP4', kind: 'Video', note: 'In and out', icon: Film },
    { f: 'WebM', kind: 'Video', note: 'In and out', icon: Film },
    { f: 'MKV', kind: 'Video', note: 'Conversion only', icon: Film },
    { f: 'MP3', kind: 'Audio', note: 'In and out', icon: Music2 },
    { f: 'M4A', kind: 'Audio', note: 'In and out', icon: Music2 },
    { f: 'WAV', kind: 'Audio', note: 'In and out', icon: Music2 },
  ];
  const adapters = describeAdapters().filter((a) => a.status === 'available');
  return (
    <Band id="formats">
      <Opener tag="Supported sources" lead="Supported sources," rest="plainly.">
        Direct links to media files on any site. Downora reads the type from the link or the server, then checks the bytes.{' '}
        {outputs.length ? 'Conversions are on for this server.' : 'Conversions need Downora’s server.'}
      </Opener>
      <div className="relative border-t border-line">
        <Cross className="-top-[5px] -left-[5px] hidden sm:block" />
        <Cross className="-top-[5px] -right-[5px] hidden sm:block" />
        <ul className="grid grid-cols-2 lg:grid-cols-6">
          {formats.map((x, i) => (
            <li key={x.f} className={cn('flex items-center gap-3 border-line p-5', i % 2 === 1 && 'border-l', i > 1 && 'border-t lg:border-t-0', i > 0 && 'lg:border-l')}>
              <IconTile>
                <x.icon />
              </IconTile>
              <div>
                <p className="text-[0.875rem] font-semibold">{x.f}</p>
                <p className="text-[0.75rem] text-ink-muted">
                  {x.kind}, {x.note.toLowerCase()}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <ul className="grid border-t border-line sm:grid-cols-3">
          {EXCLUDED_SOURCES.map((x, i) => (
            <li key={x.name} className={cn('flex items-center gap-3 border-line px-5 py-4 text-[0.8125rem] text-ink-muted', i > 0 && 'border-t sm:border-t-0 sm:border-l')}>
              <CircleSlash className="size-4 shrink-0 text-ink-faint" aria-hidden />
              <span>
                <span className="font-medium text-ink">{x.name}</span>: not supported
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-5 py-4 text-center text-[0.8125rem] text-ink-muted">
          {adapters.length} source types live today.{' '}
          <Link to="/sources" className="font-medium text-accent-soft hover:underline">
            See the full list
          </Link>
        </p>
      </div>
    </Band>
  );
}

// ───────────────────────── 12–13 · Audio and queue ─────────────────────────

export const AUDIO_ITEMS: Item[] = [
  { icon: Music2, t: 'Audio from video', d: 'Pull the soundtrack out of a video as MP3, WAV or M4A.' },
  { icon: Waves, t: 'Original audio files', d: 'Save MP3, M4A and WAV links exactly as they are.' },
  { icon: Check, t: 'Checked output', d: 'Every converted file is read back to make sure it plays.' },
];
export const QUEUE_ITEMS: Item[] = [
  { icon: Pause, t: 'Pause and resume', d: 'Continues from the same byte when the server allows it, and says so when it doesn’t.' },
  { icon: RotateCcw, t: 'Retry and cancel', d: 'A dropped connection is a button press away from finishing.' },
  { icon: Clock3, t: 'History', d: 'Search what you saved. Signed in, it follows you to the extension too.' },
];

export function AudioVisual() {
  const reduce = useReducedMotion();
  const bars = Array.from({ length: 44 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)));
  return (
    <div className="rounded-[0.875rem] border border-line bg-surface p-5 shadow-panel" aria-hidden>
      <div className="flex items-center gap-3">
        <IconTile className="size-10">
          <Music2 />
        </IconTile>
        <div>
          <p className="text-[0.875rem] font-semibold">Podcast episode 12</p>
          <p className="tag-mono text-ink-muted">MP3 · 0:12 · 188 KB</p>
        </div>
      </div>
      <div className="mt-6 flex h-20 items-center gap-[3px]">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-full bg-ink"
            style={{ height: `${h * 100}%`, transformOrigin: 'center' }}
            animate={reduce ? undefined : { scaleY: [1, 0.55 + (i % 5) * 0.08, 1] }}
            transition={{ duration: 2.4 + (i % 7) * 0.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.03 }}
          />
        ))}
      </div>
    </div>
  );
}

export function QueueVisual() {
  const rows = [
    { name: 'launch-film.mp4', state: 'Downloading', v: 0.64, s: 'active' as const, meta: '94 KB of 147 KB' },
    { name: 'interview.webm', state: 'Paused', v: 0.31, s: 'paused' as const, meta: 'Resumes from 39 KB' },
    { name: 'theme-song.mp3', state: 'Saved', v: 1, s: 'done' as const, meta: '188 KB' },
  ];
  return (
    <ul className="overflow-hidden rounded-[0.875rem] border border-line bg-surface shadow-panel" aria-hidden>
      {rows.map((r, i) => (
        <li key={r.name} className={cn('px-4 py-3.5', i > 0 && 'border-t border-line')}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[0.8125rem] font-semibold">{r.name}</p>
            <span className="tag-mono text-ink-muted">{r.state}</span>
          </div>
          <TransferTrack className="mt-2" label={r.name} value={r.v} state={r.s} size="sm" />
          <p className="tabular mt-1 text-[0.6875rem] text-ink-muted">{r.meta}</p>
        </li>
      ))}
    </ul>
  );
}

/** Two halves: words and a list on one side, an illustration on the other. */
export function FeatureSection({ id, tag, lead, rest, body, items, visual, flip }: { id?: string; tag: string; lead: string; rest: string; body: string; items: Item[]; visual: ReactNode; flip?: boolean }) {
  return (
    <Band id={id}>
      <div className={cn('grid lg:grid-cols-2 lg:divide-x lg:divide-line', flip && 'lg:[&>*:first-child]:order-2')}>
        <div className="px-5 py-14 sm:px-10 sm:py-16">
          <Tag>{tag}</Tag>
          <TwoTone lead={lead} rest={rest} className={cn('mt-5', H2)} />
          <p className="mt-4 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-muted">{body}</p>
          <ul className="mt-8 border-t border-line">
            {items.map((p) => (
              <li key={p.t} className="flex items-start gap-3.5 border-b border-line py-3.5">
                <IconTile>
                  <p.icon />
                </IconTile>
                <div>
                  <p className="text-[0.875rem] font-semibold">{p.t}</p>
                  <p className="text-[0.8125rem] text-ink-muted">{p.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-center border-t border-line bg-[radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:14px_14px] px-5 py-14 sm:px-10 lg:border-t-0">
          {visual}
        </div>
      </div>
    </Band>
  );
}

// ───────────────────────── 14 · Privacy & security ─────────────────────────

export function Privacy() {
  const points: Item[] = [
    { icon: Lock, t: 'No DRM bypass', d: 'Protected streams are never touched. Not now, not as a setting.' },
    { icon: ShieldCheck, t: 'No borrowed sign-ins', d: 'Downora never reads cookies or signs in to other sites for you.' },
    { icon: ServerCog, t: 'Guarded server', d: 'Every link the server fetches is checked against private networks, at each redirect.' },
    { icon: Ban, t: 'Files expire', d: 'Converted files are deleted from the server within an hour.' },
  ];
  return (
    <Band id="privacy">
      <Opener tag="Privacy & security" lead="Nothing to hide." rest="Nothing hidden.">
        Downora saves media you’re allowed to have, and is open about how.
      </Opener>
      <div className="relative border-t border-line">
        <Cross className="-top-[5px] -left-[5px] hidden sm:block" />
        <Cross className="-top-[5px] -right-[5px] hidden sm:block" />
        <Cells>
          {points.map((p) => (
            <Cell key={p.t} icon={<p.icon />} title={p.t} as="p">
              {p.d}
            </Cell>
          ))}
        </Cells>
      </div>
    </Band>
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
    <Band id="faq">
      <div className="grid gap-10 px-5 py-14 sm:px-10 sm:py-16 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <div>
          <Tag>FAQ</Tag>
          <TwoTone lead="Questions," rest="answered." className={cn('mt-5', H2)} />
          <p className="mt-4 text-[0.9375rem] text-ink-muted">
            More in the{' '}
            <Link to="/help" className="font-medium text-accent-soft hover:underline">
              Help center
            </Link>
            .
          </p>
        </div>
        <Accordion type="single" collapsible className="border-t border-line">
          {FAQS.map(([q, a]) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger className="py-4 text-[0.9375rem] font-medium">{q}</AccordionTrigger>
              <AccordionContent className="text-[0.875rem]">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Band>
  );
}

// ───────────────────────── 16–17 · Final CTA and footer (dark) ─────────────────────────

export function FinalCTA() {
  return (
    <section aria-label="Get started" className="bg-[#0b0b0c] text-white [color-scheme:dark]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 border-white/[0.07] px-5 py-16 sm:border-x sm:px-10 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Tag tone="dark">Ready when you are</Tag>
          <h2 className="mt-5 text-[2rem] leading-[1.05] font-semibold tracking-[-0.045em] sm:text-[3rem]">
            Your next file is <span className="block text-white/45">one paste away.</span>
          </h2>
          <p className="tag-mono mt-4 text-white/45">Free · No account for originals · Up to 8K</p>
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button size="lg" className="h-11 bg-white px-5 text-[0.9375rem] text-black hover:bg-white/90" asChild>
            <a href="#download">
              <ArrowDownToLine /> Start Downloading
            </a>
          </Button>
          <Button size="lg" className="h-11 border border-white/15 bg-white/[0.04] px-5 text-[0.9375rem] text-white hover:bg-white/10" asChild>
            <Link to="/sign-in">
              Create a free account <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const jump: [string, string][] = [
    ['How it works', '#how'],
    ['Formats', '#formats'],
    ['FAQ', '#faq'],
  ];
  const links: [string, string][] = [
    ['Dashboard', '/dashboard'],
    ['Supported sources', '/sources'],
    ['Help center', '/help'],
    ['Sign in', '/sign-in'],
  ];
  return (
    <footer className="bg-[#0b0b0c] text-white [color-scheme:dark]">
      <div className="relative mx-auto max-w-[1200px] border-t border-white/[0.07] sm:border-x">
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-10 lg:flex-row lg:items-center lg:justify-between">
          <p className="tag-mono text-white/50">© 2026 Downora · Original design</p>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-1.5">
            <span className="tag-mono mr-1 text-white/50">Jump to:</span>
            {jump.map(([l, h]) => (
              <a key={h} href={h} className="tag-mono rounded-[6px] border border-white/10 px-2 py-1 text-white/70 hover:bg-white/5 hover:text-white">
                {l}
              </a>
            ))}
            {links.map(([l, to]) => (
              <Link key={to} to={to} className="tag-mono rounded-[6px] border border-white/10 px-2 py-1 text-white/70 hover:bg-white/5 hover:text-white">
                {l}
              </Link>
            ))}
          </nav>
        </div>
        <div className="px-5 pb-6 sm:px-10">
          <DotMatrix text="DOWNORA" scale={2} pad={2} tone="dim" label="Downora" />
          <p className="tag-mono mt-4 text-right text-white/50">Only download media you own or have permission to save.</p>
        </div>
      </div>
    </footer>
  );
}
