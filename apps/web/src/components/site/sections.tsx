/**
 * Marketing sections, built from the same iOS-style parts as the app: inset
 * grouped lists, icon tiles, sheets and segmented controls. Every visual
 * either is the real product (the live downloader, real sample media) or is
 * a labelled illustration; nothing pretends to be a working control.
 */
import { describeAdapters, EXCLUDED_SOURCES } from '@downora/source-adapters';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  cn,
  IconTile,
  ListGroup,
  ListRow,
  Logo,
  LogoMark,
  TransferTrack,
  type TileColor,
} from '@downora/ui';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine,
  Ban,
  Check,
  ChevronRight,
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
import { Reveal, spring } from './motion';
import { ThemeControl } from './Navigation';

const SAMPLE_VIDEO = `${import.meta.env.BASE_URL}samples/downora-sample-1080p.mp4`;

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

type Item = { icon: typeof Film; t: string; d: string; tile?: TileColor };

/** iOS large-title style: bold, tight, left aligned unless asked. */
function SectionHeading({ title, children, align = 'left', className }: { title: ReactNode; children?: ReactNode; align?: 'left' | 'center'; className?: string }) {
  return (
    <div className={cn(align === 'center' && 'mx-auto text-center', className)}>
      <h2
        className={cn(
          'text-[2.25rem] leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-[3.25rem] lg:text-[4rem]',
          align === 'center' ? 'mx-auto max-w-[16ch]' : 'max-w-[18ch]',
        )}
      >
        {title}
      </h2>
      {children ? <p className={cn('mt-4 max-w-[52ch] text-[1.0625rem] leading-relaxed text-ink-muted sm:text-xl', align === 'center' && 'mx-auto')}>{children}</p> : null}
    </div>
  );
}

const Wrap = ({ children, className, id }: { children: ReactNode; className?: string; id?: string }) => (
  <section id={id} className={cn('scroll-mt-20', className)}>
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">{children}</div>
  </section>
);

/** A list of features as Settings-style rows. */
function ItemList({ items, className }: { items: Item[]; className?: string }) {
  return (
    <ListGroup as="ul" className={className}>
      {items.map((it) => (
        <ListRow as="li" key={it.t} icon={<it.icon />} tile={it.tile} title={<span className="font-semibold">{it.t}</span>} subtitle={it.d} className="items-start py-3 [&>span:first-child]:mt-0.5" />
      ))}
    </ListGroup>
  );
}

// ───────────────────────── 2 · Hero (+3 · live downloader) ─────────────────────────

export function Hero() {
  const reduce = useReducedMotion();
  const enter = (delay: number, y = 18) => (reduce ? {} : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay } });
  return (
    <section className="relative isolate overflow-clip pt-12 pb-20 sm:pt-20 lg:pb-28">
      <div aria-hidden className="aurora -z-10" />
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <motion.h1 {...enter(0, 24)} className="mx-auto text-center text-[2.75rem] leading-[0.98] font-bold tracking-[-0.045em] min-[400px]:text-[3.1rem] sm:text-[5.25rem] lg:text-[7.25rem]">
          <span className="block">Your Media.</span>
          <span className="block whitespace-nowrap">One Click Away.</span>
        </motion.h1>
        <motion.p {...enter(0.12)} className="mx-auto mt-6 max-w-[42ch] text-center text-[1.0625rem] leading-relaxed text-ink-muted sm:text-xl">
          Download and manage supported video and audio content with a faster, simpler media experience.
        </motion.p>
        <motion.div {...enter(0.2)} className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Button variant="primary" size="lg" className="h-[3.25rem] rounded-[0.875rem] px-7 sm:rounded-full" asChild>
            <a href="#download">
              <ArrowDownToLine /> Start Downloading
            </a>
          </Button>
          <Button variant="tinted" size="lg" className="h-[3.25rem] rounded-[0.875rem] px-7 sm:rounded-full" asChild>
            <a href="#extension">
              <Puzzle /> Get Chrome Extension
            </a>
          </Button>
        </motion.div>

        {/* The one big moment: the real downloader, presented as an iOS sheet. */}
        <motion.div
          id="download"
          {...(reduce ? {} : { initial: { opacity: 0, y: 60 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring', stiffness: 90, damping: 18, delay: 0.32 } })}
          className="relative mx-auto mt-14 max-w-[1040px] scroll-mt-24 sm:mt-16"
        >
          <div className="rounded-[2.25rem] bg-grouped p-3 shadow-pop ring-1 ring-edge sm:p-5">
            <div className="flex flex-col items-center pt-0.5 pb-4" aria-hidden>
              <span className="h-[5px] w-9 rounded-full bg-ink-faint/40" />
              <span className="mt-3.5 text-[1.0625rem] font-semibold">New download</span>
              <span className="text-[0.8125rem] text-ink-muted">Paste a link or try a sample</span>
            </div>
            <Downloader size="lg" variant="stage" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────── 4–7 · Anatomy: preview, quality, format, progress ─────────────────────────

function QualityList() {
  const tiers = ['8K', '4K', '2K', '1080p', '720p', '480p'];
  return (
    <ListGroup as="ol" aria-label="Quality tiers for a 1080p source" className="bg-grouped">
      {tiers.map((t, i) => {
        const above = i < 3;
        return (
          <li key={t} className={cn('flex min-h-10 items-center gap-3 px-4 text-[0.9375rem]', above && 'text-ink-faint')}>
            <span className={cn('flex-1', i === 3 && 'font-semibold')}>{t}</span>
            <span className="text-[0.8125rem] text-ink-muted">{above ? 'Not in source' : i === 3 ? 'Source' : 'Scaled down'}</span>
            <Check className={cn('size-4 text-accent-soft', i !== 3 && 'invisible')} strokeWidth={2.6} aria-hidden />
          </li>
        );
      })}
    </ListGroup>
  );
}

function ProgressDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20%' });
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="rounded-[1.25rem] bg-grouped p-4" aria-hidden>
      <div className="flex items-center gap-3">
        <IconTile color="violet">
          <Film />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-semibold">launch-film.mp4</p>
          <p className="tabular text-[0.8125rem] text-ink-muted">520 KB of 722 KB, 1 s left</p>
        </div>
        <span className="tabular text-[1.75rem] leading-none font-semibold tracking-[-0.03em]">72%</span>
      </div>
      <TransferTrack label="Example progress" value={inView || reduce ? 0.72 : 0} className="mt-4 h-2.5 [&>div]:duration-[1600ms]" />
    </div>
  );
}

const Widget = ({ className, children }: { className?: string; children: ReactNode }) => <div className={cn('rounded-[1.75rem] bg-cell p-5 sm:p-7', className)}>{children}</div>;

function WidgetHead({ icon, tile, title, children }: { icon: ReactNode; tile: TileColor; title: string; children: ReactNode }) {
  return (
    <>
      <IconTile color={tile}>{icon}</IconTile>
      <h3 className="mt-4 text-[1.375rem] font-bold tracking-[-0.025em]">{title}</h3>
      <p className="mt-1 text-[0.9375rem] text-ink-muted">{children}</p>
    </>
  );
}

export function Anatomy() {
  return (
    <Wrap className="bg-grouped py-20 sm:py-28">
      <SectionHeading title="Everything a download needs. Nothing it doesn’t.">
        The downloader above is built from four parts. Each one only shows what the file really has.
      </SectionHeading>
      <Reveal className="mt-12 grid gap-4 lg:grid-cols-6">
        <Widget className="flex flex-col lg:col-span-4">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-end lg:h-full lg:grid-cols-1 lg:grid-rows-[1fr_auto]">
            <SampleVideo className="aspect-video w-full rounded-[1.25rem] bg-black object-cover lg:aspect-auto lg:h-full lg:max-h-[19rem]" label="Sample media preview" />
            <div>
              <WidgetHead icon={<Eye />} tile="sky" title="Media preview">
                Watch or listen before you save. Downora reads the real length, resolution and size from the file itself.
              </WidgetHead>
            </div>
          </div>
        </Widget>
        <Widget className="lg:col-span-2">
          <WidgetHead icon={<Gauge />} tile="orange" title="Quality selector">
            Never a fake 4K. Only the source quality and lower.
          </WidgetHead>
          <div className="mt-5">
            <QualityList />
          </div>
        </Widget>
        <Widget className="lg:col-span-3">
          <WidgetHead icon={<ListChecks />} tile="green" title="Format selector">
            Keep the original, or convert on Downora’s server.
          </WidgetHead>
          <div className="mt-5 grid gap-4 sm:grid-cols-2" aria-hidden>
            {(
              [
                ['Video', ['MP4', 'WEBM', 'MKV']],
                ['Audio', ['MP3', 'WAV', 'M4A']],
              ] as const
            ).map(([label, list]) => (
              <div key={label}>
                <p className="mb-1.5 px-4 text-[0.8125rem] text-ink-muted">{label}</p>
                <ListGroup className="bg-grouped">
                  {list.map((f, i) => (
                    <div key={f} className="flex min-h-10 items-center px-4 text-[0.9375rem]">
                      <span className={cn('flex-1', i === 0 && 'font-semibold')}>{f}</span>
                      {i === 0 ? <Check className="size-4 text-accent-soft" strokeWidth={2.6} /> : null}
                    </div>
                  ))}
                </ListGroup>
              </div>
            ))}
          </div>
        </Widget>
        <Widget className="lg:col-span-3">
          <WidgetHead icon={<ArrowDownToLine />} tile="violet" title="Download progress">
            Counted from bytes that actually arrived, never estimated or animated for show.
          </WidgetHead>
          <div className="mt-5">
            <ProgressDemo />
          </div>
        </Widget>
      </Reveal>
    </Wrap>
  );
}

// ───────────────────────── 8 · How it works ─────────────────────────

export function HowItWorks() {
  const steps: (Item & { tile: TileColor })[] = [
    { icon: ClipboardPaste, tile: 'sky', t: 'Paste or detect', d: 'Paste a direct file link, or let the extension find supported media on the page you’re watching.' },
    { icon: ScanSearch, tile: 'violet', t: 'Pick what’s real', d: 'Choose video or audio, a format and a quality, from options the file actually offers.' },
    { icon: ArrowDownToLine, tile: 'green', t: 'Save it', d: 'The original downloads in your browser. Conversions run on Downora’s server, then download to you.' },
  ];
  return (
    <Wrap id="how" className="py-20 sm:py-28">
      <SectionHeading title="Three steps. No detours." align="center" />
      <Reveal as="div" className="mx-auto mt-12 max-w-3xl">
        <ListGroup as="ol">
          {steps.map((s, i) => (
            <li key={s.t} className="flex items-start gap-4 px-4 py-4 sm:px-5" style={{ ['--inset' as string]: '4.5rem' }}>
              <span className="relative">
                <IconTile color={s.tile} className="size-10 rounded-[10px] [&_svg]:size-5">
                  <s.icon />
                </IconTile>
              </span>
              <div className="min-w-0 flex-1">
                <p className="tabular text-[0.8125rem] text-ink-muted">Step {i + 1}</p>
                <h3 className="text-[1.25rem] font-bold tracking-[-0.02em]">{s.t}</h3>
                <p className="mt-0.5 text-[0.9375rem] text-ink-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ListGroup>
      </Reveal>
    </Wrap>
  );
}

// ───────────────────────── 9 · Chrome extension ─────────────────────────

function BrowserMock() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-25%' });
  return (
    <div ref={ref} className="relative overflow-hidden rounded-[1.75rem] bg-cell shadow-pop ring-1 ring-edge" aria-hidden>
      <div className="flex h-11 items-center gap-2 px-4">
        <span className="size-3 rounded-full bg-fill-strong" />
        <span className="size-3 rounded-full bg-fill-strong" />
        <span className="size-3 rounded-full bg-fill-strong" />
        <span className="ml-3 flex h-7 flex-1 items-center rounded-[0.5rem] bg-fill px-3 text-[0.75rem] text-ink-muted">example.com/launch</span>
        <span className="ml-1 grid size-7 place-items-center rounded-[0.5rem] bg-fill">
          <LogoMark className="size-4" />
        </span>
      </div>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="relative aspect-video overflow-hidden rounded-[1.25rem] bg-black">
          <SampleVideo className="size-full object-cover opacity-90" />
          <motion.span initial={{ scale: 0, opacity: 0 }} animate={inView ? { scale: 1, opacity: 1 } : {}} transition={{ ...spring, delay: 0.3 }} className="material absolute top-3 right-3 grid size-11 place-items-center rounded-full shadow-pop">
            <LogoMark className="size-7" />
          </motion.span>
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{ ...spring, delay: 0.75 }}
            className="material absolute top-16 right-3 w-[min(250px,74%)] rounded-[1.25rem] p-2.5 shadow-pop"
          >
            <p className="px-1.5 text-[0.875rem] font-semibold text-ink">Launch film</p>
            <p className="px-1.5 text-[0.75rem] text-ink-muted">0:08, 1920 × 1080</p>
            <div className="mt-2 overflow-hidden rounded-[0.75rem] bg-cell/80 text-[0.8125rem]">
              <span className="flex items-center justify-between px-3 py-2 text-ink">
                <span className="font-semibold">MP4 1080p</span>
                <span className="flex items-center gap-1.5 text-ink-muted">
                  722 KB <Check className="size-3.5 text-accent-soft" strokeWidth={2.6} />
                </span>
              </span>
              <span className="flex items-center justify-between border-t border-line px-3 py-2 text-ink">
                <span>WEBM 720p</span>
                <span className="text-ink-muted">261 KB</span>
              </span>
            </div>
            <span className="mt-2 block rounded-[0.75rem] bg-accent-fill py-2 text-center text-[0.8125rem] font-semibold text-white">Download video</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function ExtensionShowcase() {
  const points: Item[] = [
    { icon: ScanSearch, tile: 'sky', t: 'Finds media as pages load', d: 'Including players that appear later.' },
    { icon: MousePointerClick, tile: 'violet', t: 'One button on the player', d: 'Top corner, clear of the controls, styled in its own Shadow DOM.' },
    { icon: KeyRound, tile: 'orange', t: 'Asks per site', d: 'No access to any site until you turn it on.' },
    { icon: Clock3, tile: 'green', t: 'History that syncs', d: 'Sign in and your downloads show up in the web app too.' },
  ];
  return (
    <Wrap id="extension" className="bg-grouped py-20 sm:py-28">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
        <div>
          <SectionHeading title="Downora, right on the player.">
            The Chrome extension spots supported video and audio on the page you’re watching and puts a small Downora button on it.
          </SectionHeading>
          <ItemList items={points} className="mt-10" />
          <p className="mt-6 mb-1.5 px-4 text-[0.8125rem] text-ink-muted">Developer preview</p>
          <ListGroup>
            <div className="px-4 py-3.5 text-[0.9375rem]">
              <p className="text-ink-muted">
                It isn’t on the Chrome Web Store yet. Build it with <code className="rounded-md bg-fill px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">pnpm ext:build</code>, open{' '}
                <code className="rounded-md bg-fill px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">chrome://extensions</code>, turn on Developer mode, and load the{' '}
                <code className="rounded-md bg-fill px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink">apps/extension/dist</code> folder.
              </p>
            </div>
            <a
              href="https://github.com/uxuimonir/downora/tree/main/apps/extension"
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-h-11 items-center justify-between px-4 text-[1.0625rem] text-accent-soft hover:bg-fill/50"
            >
              Read the install guide
              <ChevronRight className="size-4 text-ink-faint" aria-hidden />
            </a>
          </ListGroup>
        </div>
        <Reveal className="lg:sticky lg:top-24">
          <BrowserMock />
          <p className="mt-3 text-center text-[0.8125rem] text-ink-muted">How the extension looks on a page with a supported video.</p>
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
      ? `Can become ${outputs
          .filter((o) => (kind === 'Audio' ? ['mp3', 'wav', 'm4a'].includes(o) : true))
          .map((o) => o.toUpperCase())
          .join(', ')}`
      : 'Conversions need Downora’s server';
  const adapters = describeAdapters().filter((a) => a.status === 'available');
  return (
    <Wrap id="sources" className="py-20 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <SectionHeading title="Supported sources, plainly.">
          Direct links to media files on any site. Downora reads the file type from the link or what the server reports, then checks the bytes.
        </SectionHeading>
        <Reveal>
          <p className="mb-1.5 px-4 text-[0.8125rem] text-ink-muted">File types</p>
          <ListGroup as="ul">
            {rows.map((r) => (
              <ListRow
                as="li"
                key={r.f}
                icon={r.kind === 'Video' ? <Film /> : <Music2 />}
                tile={r.kind === 'Video' ? 'violet' : 'pink'}
                title={<span className="font-semibold">{r.f}</span>}
                subtitle={`${r.kind}, ${r.ext}. ${conv(r.kind)}.`}
              />
            ))}
          </ListGroup>
          <p className="mt-1.5 px-4 text-[0.8125rem] text-ink-muted">
            {adapters.length} source types are live today.{' '}
            <Link to="/sources" className="font-medium text-accent-soft hover:underline">
              See the full list
            </Link>
          </p>
          <p className="mt-7 mb-1.5 px-4 text-[0.8125rem] text-ink-muted">Not supported</p>
          <ListGroup as="ul">
            {EXCLUDED_SOURCES.map((x) => (
              <ListRow as="li" key={x.name} icon={<CircleSlash />} tile="gray" title={x.name} />
            ))}
          </ListGroup>
        </Reveal>
      </div>
    </Wrap>
  );
}

// ───────────────────────── 11–13 · Features ─────────────────────────

/** A two-column feature with a visual; `flip` swaps the sides. */
export function FeatureSection({ id, title, body, items, visual, flip }: { id?: string; title: string; body: string; items: Item[]; visual: ReactNode; flip?: boolean }) {
  return (
    <Wrap id={id} className="py-16 sm:py-24">
      <div className={cn('grid items-center gap-10 lg:grid-cols-2 lg:gap-20', flip && 'lg:[&>*:first-child]:order-2')}>
        <Reveal>{visual}</Reveal>
        <div>
          <SectionHeading title={title}>{body}</SectionHeading>
          <ItemList items={items} className="mt-8" />
        </div>
      </div>
    </Wrap>
  );
}

export function VideoVisual() {
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(60%_60%_at_30%_30%,rgb(139_92_246/0.3),transparent_70%),radial-gradient(50%_50%_at_80%_80%,rgb(56_189_248/0.25),transparent_70%)] blur-2xl" />
      <SampleVideo className="aspect-video w-full rounded-[1.75rem] bg-black object-cover shadow-pop" label="Sample video" />
      <div className="material absolute -bottom-6 left-4 flex items-center gap-3 rounded-[1.125rem] py-2 pr-4 pl-2 shadow-pop" aria-hidden>
        <IconTile color="violet">
          <Film />
        </IconTile>
        <div className="leading-tight">
          <p className="text-[0.875rem] font-semibold">1080p, H.264</p>
          <p className="tabular text-[0.75rem] text-ink-muted">1920 × 1080, 0:08</p>
        </div>
      </div>
    </div>
  );
}

export function AudioVisual() {
  const reduce = useReducedMotion();
  const bars = Array.from({ length: 48 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)));
  return (
    <div className="rounded-[1.75rem] bg-cell p-5 shadow-pop sm:p-7" aria-hidden>
      <div className="flex items-center gap-3">
        <span className="accent-gradient grid size-14 place-items-center rounded-[0.875rem]">
          <Music2 className="size-7 text-white" />
        </span>
        <div>
          <p className="text-[1.0625rem] font-semibold">Podcast episode 12</p>
          <p className="text-[0.875rem] text-ink-muted">MP3, 0:12, 188 KB</p>
        </div>
      </div>
      <div className="mt-7 flex h-24 items-center gap-[3px]">
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
      <div className="mt-6 grid grid-cols-3 gap-0.5 rounded-[0.5625rem] bg-fill p-0.5 text-center text-[0.8125rem]">
        {['MP3', 'WAV', 'M4A'].map((f, i) => (
          <span key={f} className={cn('rounded-[0.4375rem] py-1.5', i === 0 ? 'bg-[var(--dn-segment)] font-semibold shadow-[0_3px_8px_rgb(0_0_0/0.12)]' : 'text-ink')}>
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

export function QueueVisual() {
  const rows = [
    { name: 'launch-film.mp4', state: 'Downloading', v: 0.64, s: 'active' as const, meta: '462 KB of 722 KB', icon: Film, tile: 'violet' as const },
    { name: 'interview.webm', state: 'Paused', v: 0.31, s: 'paused' as const, meta: 'Resumes from 68 KB', icon: Pause, tile: 'orange' as const },
    { name: 'theme-song.mp3', state: 'Saved', v: 1, s: 'done' as const, meta: '188 KB', icon: Check, tile: 'green' as const },
  ];
  return (
    <div aria-hidden>
      <p className="mb-1.5 px-4 text-[0.8125rem] text-ink-muted">Queue</p>
      <ListGroup className="shadow-pop">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3 px-4 py-3.5" style={{ ['--inset' as string]: '3.75rem' }}>
            <IconTile color={r.tile}>
              <r.icon />
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[0.9375rem] font-semibold">{r.name}</p>
                <span className={cn('text-[0.8125rem]', r.s === 'done' ? 'text-success' : r.s === 'paused' ? 'text-warn' : 'text-accent-soft')}>{r.state}</span>
              </div>
              <TransferTrack className="mt-2" label={r.name} value={r.v} state={r.s} size="sm" />
              <p className="tabular mt-1.5 text-[0.75rem] text-ink-muted">{r.meta}</p>
            </div>
          </div>
        ))}
      </ListGroup>
    </div>
  );
}

export const VIDEO_ITEMS: Item[] = [
  { icon: ScanSearch, tile: 'sky', t: 'Real resolution', d: 'Read from the stream with FFprobe. 4K is shown only when the file is 4K.' },
  { icon: Gauge, tile: 'orange', t: 'Scale down, never up', d: 'Turn a 1080p file into 720p or 480p. Upscaling isn’t offered.' },
  { icon: Film, tile: 'violet', t: 'MP4, WebM and MKV', d: 'Keep the original, or convert on Downora’s server when you’re signed in.' },
];
export const AUDIO_ITEMS: Item[] = [
  { icon: Music2, tile: 'pink', t: 'Audio from video', d: 'Pull the soundtrack out of a video as MP3, WAV or M4A.' },
  { icon: Waves, tile: 'sky', t: 'Original audio files', d: 'Save MP3, M4A and WAV links exactly as they are.' },
  { icon: Check, tile: 'green', t: 'Checked output', d: 'Every converted file is read back to make sure it plays.' },
];
export const QUEUE_ITEMS: Item[] = [
  { icon: Pause, tile: 'orange', t: 'Pause and resume', d: 'Continues from the same byte when the server allows it, and says so when it doesn’t.' },
  { icon: RotateCcw, tile: 'violet', t: 'Retry and cancel', d: 'A dropped connection is a button press away from finishing.' },
  { icon: Clock3, tile: 'green', t: 'History', d: 'Search what you saved. Signed in, it follows you to the extension too.' },
];

// ───────────────────────── 14 · Privacy & security ─────────────────────────

export function Privacy() {
  const points: Item[] = [
    { icon: Lock, tile: 'indigo', t: 'No DRM bypass', d: 'Protected streams are never touched. Not now, not as a setting.' },
    { icon: ShieldCheck, tile: 'green', t: 'No borrowed sign-ins', d: 'Downora never reads cookies or signs in to other sites for you.' },
    { icon: ServerCog, tile: 'sky', t: 'Guarded server', d: 'Every link the server fetches is checked against private networks, at each redirect.' },
    { icon: Ban, tile: 'orange', t: 'Files expire', d: 'Converted files are deleted from the server within an hour.' },
  ];
  return (
    <section id="privacy" className="scroll-mt-20 bg-[#08090d] py-20 text-[#f8fafc] sm:py-28 [color-scheme:dark]">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
        <Reveal>
          <span className="grid size-16 place-items-center rounded-[1.125rem] bg-[#5b5bd6]">
            <ShieldCheck className="size-8 text-white" aria-hidden />
          </span>
          <h2 className="mt-6 max-w-[14ch] text-[2.5rem] leading-[1.02] font-bold tracking-[-0.04em] sm:text-[4rem]">Nothing to hide. Nothing hidden.</h2>
          <p className="mt-5 max-w-[46ch] text-[1.0625rem] text-[#a7b4c8] sm:text-xl">Downora saves media you’re allowed to have, and is open about how.</p>
        </Reveal>
        <ListGroup as="ul" className="bg-[#191e28] [&>*+*]:before:bg-white/15">
          {points.map((p) => (
            <li key={p.t} className="flex items-start gap-3 px-4 py-3.5" style={{ ['--inset' as string]: '3.75rem' }}>
              <IconTile color={p.tile} className="mt-0.5">
                <p.icon />
              </IconTile>
              <div>
                <p className="text-[1.0625rem] font-semibold">{p.t}</p>
                <p className="mt-0.5 text-[0.9375rem] text-[#a7b4c8]">{p.d}</p>
              </div>
            </li>
          ))}
        </ListGroup>
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
    <Wrap id="faq" className="bg-grouped py-20 sm:py-28">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
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
          <Accordion type="single" collapsible className="overflow-hidden rounded-panel bg-cell px-4 [&>*:last-child]:border-b-0">
            {FAQS.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="py-4 text-[1.0625rem]">{q}</AccordionTrigger>
                <AccordionContent className="text-[0.9375rem]">{a}</AccordionContent>
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
    <Wrap className="bg-grouped pb-20 sm:pb-28">
      <Reveal className="relative isolate overflow-hidden rounded-[2.25rem] px-6 py-14 text-center sm:px-12 sm:py-20">
        <div aria-hidden className="aurora aurora-strong -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-cell/50 backdrop-blur-xl [border-radius:inherit]" />
        <span className="mx-auto block w-fit">
          <LogoMark className="size-16" />
        </span>
        <h2 className="mx-auto mt-6 max-w-[14ch] text-[2.5rem] leading-[1.02] font-bold tracking-[-0.04em] sm:text-[4rem]">Your next file is one paste away.</h2>
        <div className="mx-auto mt-9 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Button variant="primary" size="lg" className="h-[3.25rem] rounded-[0.875rem] px-7 sm:rounded-full" asChild>
            <a href="#download">
              <ArrowDownToLine /> Start Downloading
            </a>
          </Button>
          <Button variant="tinted" size="lg" className="h-[3.25rem] rounded-[0.875rem] px-7 sm:rounded-full" asChild>
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
    <footer className="border-t border-line bg-grouped">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-[30ch] text-[0.875rem] text-ink-muted">Download and manage the media you’re allowed to save. No DRM bypass, ever.</p>
          <ThemeControl className="mt-6" />
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <p className="text-[0.875rem] font-semibold">{title}</p>
            <ul className="mt-3 flex flex-col">
              {links.map(([label, to]) => (
                <li key={label}>
                  {to.startsWith('/#') ? (
                    <a href={to.slice(1)} className="inline-flex min-h-10 items-center text-[0.875rem] text-ink-muted hover:text-ink">
                      {label}
                    </a>
                  ) : (
                    <Link to={to} className="inline-flex min-h-10 items-center text-[0.875rem] text-ink-muted hover:text-ink">
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
        <p className="mx-auto max-w-[1200px] px-4 py-6 text-[0.75rem] text-ink-muted sm:px-6 lg:px-8">© 2026 Downora. Original design; not affiliated with any media platform.</p>
      </div>
    </footer>
  );
}
