import { EXCLUDED_SOURCES } from '@downora/source-adapters';
import { Badge, Button, Logo, LogoMark, TransferTrack } from '@downora/ui';
import { motion, useReducedMotion } from 'framer-motion';
import { Ban, Check, Globe, Laptop, Play, Puzzle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Downloader } from '@/components/downloader/Downloader';

const ease = [0.22, 1, 0.36, 1] as const;

function HeroTrack() {
  // One orchestrated moment: the signature track fills once after the headline lands.
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setValue(1), 650);
    return () => clearTimeout(t);
  }, [reduce]);
  return (
    <TransferTrack
      aria-hidden
      label="Decorative"
      value={value}
      state="active"
      className="h-3 [&>div]:duration-[1400ms] [&>div]:ease-[cubic-bezier(0.22,1,0.36,1)]"
    />
  );
}

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="Downora home">
          <Logo />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
          <Link to="/sources" className="hidden rounded-control px-3 py-2 text-sm text-ink-muted hover:text-ink sm:inline-block">
            Sources
          </Link>
          <Link to="/help" className="hidden rounded-control px-3 py-2 text-sm text-ink-muted hover:text-ink sm:inline-block">
            Help
          </Link>
          <Button variant="primary" size="sm" asChild>
            <Link to="/dashboard">Open Downora</Link>
          </Button>
        </nav>
      </header>

      <main>
        {/* Hero: the product itself, working. */}
        <section className="relative mx-auto max-w-[1200px] px-4 pt-12 pb-20 sm:px-6 sm:pt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 right-[-20%] -z-10 h-[620px] w-[820px] rounded-full bg-[radial-gradient(closest-side,rgb(139_92_246/0.18),transparent)] blur-2xl"
          />
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="display-tight max-w-[14ch] text-5xl font-bold sm:text-6xl lg:text-7xl"
          >
            One click. Any supported media.
          </motion.h1>
          <div className="mt-8 max-w-[520px]">
            <HeroTrack />
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-8 max-w-[54ch] text-lg text-ink-muted"
          >
            Paste a link to a video or audio file. Downora reads what’s really there, lets you choose, and saves it with
            honest progress. Try it right here.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease }}
            className="mt-10 max-w-[960px]"
          >
            <Downloader size="lg" />
          </motion.div>
        </section>

        {/* The flow — a real sequence, so it's numbered. */}
        <section className="border-t border-line bg-surface/40">
          <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
            <h2 className="display-tight max-w-[22ch] text-4xl font-semibold sm:text-5xl">From link to file in three steps</h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {[
                ['Paste or detect', 'Paste a file link, or let the extension spot supported media on the page you’re watching.'],
                ['Choose what’s real', 'Downora reads resolution, length and size from the file. It only offers formats the source actually has.'],
                ['Save with live progress', 'Bytes are counted as they arrive. Pause, resume where the server allows it, or cancel at any point.'],
              ].map(([title, body], i) => (
                <li key={title} className="border-t border-line-strong pt-5">
                  <span className="display-tight tabular text-5xl font-semibold text-violet-soft/80">{i + 1}</span>
                  <h3 className="mt-3 font-sans text-lg font-semibold tracking-normal [font-variation-settings:normal]">{title}</h3>
                  <p className="mt-2 max-w-[38ch] text-ink-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Surfaces, with honest status. */}
        <section className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div>
              <h2 className="display-tight max-w-[18ch] text-4xl font-semibold sm:text-5xl">Wherever you find the media</h2>
              <ul className="mt-10 flex flex-col divide-y divide-line border-y border-line">
                <Surface icon={Globe} name="Web app" status={<Badge tone="success" dot>Available now</Badge>}>
                  Paste a link and save it from any modern browser.
                </Surface>
                <Surface icon={Puzzle} name="Chrome extension" status={<Badge tone="violet">In development</Badge>}>
                  A small button appears next to supported videos. No browsing history is collected.
                </Surface>
                <Surface icon={Laptop} name="Desktop app" status={<Badge tone="violet">In development</Badge>}>
                  Windows and macOS, with a download folder you choose and no file size limit.
                </Surface>
              </ul>
            </div>
            <ExtensionConcept />
          </div>
        </section>

        {/* Boundaries. */}
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <h2 className="display-tight max-w-[16ch] text-4xl font-semibold sm:text-5xl">Built to stay on the right side of the line</h2>
              <p className="mt-4 max-w-[46ch] text-ink-muted">
                Downora saves files you’re allowed to have. These limits aren’t settings; they’re how it’s made.
              </p>
            </div>
            <ul className="flex flex-col gap-4">
              {EXCLUDED_SOURCES.map((item) => (
                <li key={item.name} className="flex gap-4 rounded-panel border border-line bg-surface p-5">
                  <Ban className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-1 text-sm text-ink-muted">{item.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-6">
          <div className="relative overflow-hidden rounded-stage border border-line-strong bg-surface px-6 py-14 sm:px-12">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(60%_120%_at_100%_0%,rgb(139_92_246/0.22),transparent_60%),radial-gradient(50%_100%_at_0%_100%,rgb(56_189_248/0.12),transparent_60%)]"
            />
            <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <h2 className="display-tight max-w-[20ch] text-3xl font-semibold sm:text-4xl">Your next file is one paste away</h2>
              <Button variant="primary" size="lg" asChild>
                <Link to="/dashboard">Open Downora</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2">
            <LogoMark className="size-5" /> Downora
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/sources" className="hover:text-ink">Supported sources</Link>
            <Link to="/help" className="hover:text-ink">Help center</Link>
            <Link to="/settings" className="hover:text-ink">Settings</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Surface({
  icon: Icon,
  name,
  status,
  children,
}: {
  icon: typeof Globe;
  name: string;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 py-5">
      <Icon className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-medium">{name}</p>
          {status}
        </div>
        <p className="mt-1 text-sm text-ink-muted">{children}</p>
      </div>
    </li>
  );
}

/** Illustration of the planned extension overlay — labelled as a concept, not a screenshot. */
function ExtensionConcept() {
  return (
    <figure className="relative">
      <div className="overflow-hidden rounded-stage border border-line-strong bg-surface shadow-pop">
        <div className="flex h-9 items-center gap-1.5 border-b border-line px-4" aria-hidden>
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 h-5 flex-1 rounded-md bg-canvas" />
        </div>
        <div className="relative p-4 sm:p-6" aria-hidden>
          <div className="relative aspect-video overflow-hidden rounded-panel bg-[linear-gradient(135deg,#2a1b5c_0%,#131720_55%,#0e3a52_100%)]">
            <div className="absolute inset-0 grid place-items-center">
              <Play className="size-10 fill-white/80 text-white/80" />
            </div>
            <div className="absolute inset-x-4 bottom-3 h-1 rounded-full bg-white/20">
              <div className="h-full w-1/3 rounded-full bg-white/80" />
            </div>
            <span className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-canvas/85 ring-1 ring-white/15 backdrop-blur">
              <LogoMark className="size-6" />
            </span>
            <div className="absolute top-16 right-3 w-[min(240px,70%)] rounded-panel border border-line-strong bg-raised/95 p-3 shadow-pop backdrop-blur">
              <p className="text-xs font-semibold text-ink">Save this video</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                <li className="flex items-center justify-between rounded-md bg-violet/15 px-2 py-1.5 text-ink">
                  <span className="flex items-center gap-1.5">
                    <Check className="size-3 text-violet-soft" /> MP4, 1080p
                  </span>
                  <span className="text-ink-muted">48 MB</span>
                </li>
                <li className="flex items-center justify-between px-2 py-1.5 text-ink-muted">
                  <span>WebM, 720p</span>
                  <span>21 MB</span>
                </li>
              </ul>
              <div className="mt-2 rounded-md bg-violet-deep py-1.5 text-center text-xs font-medium text-white">Download</div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-ink-faint">Concept of the extension button and picker. Not yet released.</figcaption>
    </figure>
  );
}
