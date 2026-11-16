import { describeAdapters, EXCLUDED_SOURCES } from '@downora/source-adapters';
import { Badge, Button, Logo, LogoMark } from '@downora/ui';
import { motion } from 'framer-motion';
import { Ban, Check, ChevronRight, Globe, Laptop, Play, Puzzle } from 'lucide-react';
import { Link } from 'react-router';
import { Downloader } from '@/components/downloader/Downloader';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

const ease = [0.22, 1, 0.36, 1] as const;

const FORMATS = [...new Set(describeAdapters().filter((a) => a.status === 'available').flatMap((a) => a.formats))];

export function LandingPage() {
  useDocumentTitle('');
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="material sticky top-0 z-40 border-b border-white/6 pt-safe">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Downora home" className="flex min-h-11 items-center">
            <Logo />
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
            <Link to="/sources" className="hidden rounded-full px-3 py-2 text-sm text-ink-muted hover:text-ink sm:inline-block">
              Sources
            </Link>
            <Link to="/help" className="hidden rounded-full px-3 py-2 text-sm text-ink-muted hover:text-ink sm:inline-block">
              Help
            </Link>
            <Button variant="primary" size="sm" asChild>
              <Link to="/dashboard">Open Downora</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero — layout follows the reference: breadcrumb, light display headline, description in the right column. */}
        <section className="mx-auto max-w-[1240px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
          <p className="label-mono flex items-center gap-2.5 text-ink-muted">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            Downora / Web app
          </p>
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease }}
              className="text-[3.25rem] leading-[0.98] font-light tracking-[-0.045em] sm:text-[4.75rem] lg:text-[6rem]"
            >
              One click. Any supported media.
            </motion.h1>
            <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink-muted lg:pb-3">
              Paste a link to a video or audio file. Downora reads what’s really there, lets you choose, and saves it with
              live, honest progress. Try it below.
            </p>
          </div>

          {/* Stat strip */}
          <dl className="mt-12 grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-surface md:grid-cols-[1fr_1fr_1fr_1.4fr]">
            {[
              [String(FORMATS.length), 'File types supported'],
              ['0 B', 'Uploaded to a server'],
              ['1 of 3', 'Apps available today'],
            ].map(([value, label], i) => (
              <div
                key={label}
                className={`flex flex-col-reverse border-line px-5 py-5 ${i % 2 === 0 ? 'border-r' : 'md:border-r'} ${i < 2 ? 'border-b md:border-b-0' : ''}`}
              >
                <dt className="label-mono mt-3">{label}</dt>
                <dd className="text-[1.625rem] leading-none font-light tracking-[-0.03em]">{value}</dd>
              </div>
            ))}
            <div className="flex flex-col-reverse px-5 py-4">
              <dt className="label-mono mt-2.5">Formats</dt>
              <dd className="flex flex-wrap gap-1.5">
                {FORMATS.map((f) => (
                  <Badge key={f} tone="solid">
                    {f}
                  </Badge>
                ))}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[0.8125rem] text-ink-faint">
            Direct file links work today. The Chrome extension and desktop app are in development, and format conversion
            arrives with the media service.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease }}
            className="mt-12 max-w-[980px]"
          >
            <Downloader size="lg" />
          </motion.div>
        </section>

        {/* The flow — a real sequence, so it's numbered. */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6">
            <p className="label-mono">How it works</p>
            <h2 className="mt-3 max-w-[20ch] text-[2.5rem] leading-[1.05] font-light tracking-[-0.04em] sm:text-[3.25rem]">
              From link to file in three steps
            </h2>
            <ol className="mt-12 grid overflow-hidden rounded-panel border border-line bg-surface md:grid-cols-3">
              {[
                ['Paste or detect', 'Paste a file link, or let the extension spot supported media on the page you’re watching.'],
                ['Choose what’s real', 'Downora reads resolution, length and size from the file. It only offers formats the source actually has.'],
                ['Save with live progress', 'Bytes are counted as they arrive. Pause, resume where the server allows it, or cancel at any point.'],
              ].map(([title, body], i) => (
                <li key={title} className="border-line p-6 not-last:border-b md:not-last:border-r md:not-last:border-b-0">
                  <span className="tabular font-mono text-sm text-accent">0{i + 1}</span>
                  <h3 className="mt-6 text-lg font-semibold tracking-[-0.015em]">{title}</h3>
                  <p className="mt-2 max-w-[38ch] text-[0.9375rem] text-ink-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Surfaces, with honest status — styled as an iOS grouped list. */}
        <section className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div>
              <p className="label-mono">Platforms</p>
              <h2 className="mt-3 max-w-[16ch] text-[2.5rem] leading-[1.05] font-light tracking-[-0.04em] sm:text-[3.25rem]">
                Wherever you find the media
              </h2>
              <ul className="mt-10 overflow-hidden rounded-panel border border-line bg-surface">
                <Surface icon={Globe} name="Web app" status={<Badge tone="success" dot>Available</Badge>}>
                  Paste a link and save it from any modern browser.
                </Surface>
                <Surface icon={Puzzle} name="Chrome extension" status={<Badge tone="accent">In development</Badge>}>
                  A small button appears next to supported videos. No browsing history is collected.
                </Surface>
                <Surface icon={Laptop} name="Desktop app" status={<Badge tone="accent">In development</Badge>}>
                  Windows and macOS, with a download folder you choose and no file size limit.
                </Surface>
              </ul>
            </div>
            <ExtensionConcept />
          </div>
        </section>

        {/* Boundaries. */}
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <p className="label-mono">Boundaries</p>
              <h2 className="mt-3 max-w-[16ch] text-[2.5rem] leading-[1.05] font-light tracking-[-0.04em] sm:text-[3.25rem]">
                Built to stay on the right side of the line
              </h2>
              <p className="mt-4 max-w-[46ch] text-ink-muted">
                Downora saves files you’re allowed to have. These limits aren’t settings; they’re how it’s made.
              </p>
            </div>
            <ul className="overflow-hidden rounded-panel border border-line bg-surface">
              {EXCLUDED_SOURCES.map((item) => (
                <li key={item.name} className="flex gap-4 border-b border-line p-5 last:border-b-0">
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

        <section className="mx-auto max-w-[1240px] px-4 pb-24 sm:px-6">
          <div className="flex flex-col items-start gap-6 rounded-stage border border-line bg-surface px-6 py-12 sm:px-12 md:flex-row md:items-center md:justify-between">
            <h2 className="max-w-[18ch] text-[2rem] leading-[1.1] font-light tracking-[-0.035em] sm:text-[2.5rem]">
              Your next file is one paste away
            </h2>
            <Button variant="primary" size="lg" asChild>
              <Link to="/dashboard">Open Downora</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2">
            <LogoMark className="size-5" /> Downora
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
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
    <li className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-accent/15">
        <Icon className="size-[18px] text-accent" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-medium">{name}</p>
          {status}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">{children}</p>
      </div>
      <ChevronRight className="hidden size-4 text-ink-faint sm:block" aria-hidden />
    </li>
  );
}

/** Illustration of the planned extension overlay — labelled as a concept, not a screenshot. */
function ExtensionConcept() {
  return (
    <figure className="relative">
      <div className="overflow-hidden rounded-stage border border-line bg-surface">
        <div className="flex h-10 items-center gap-1.5 border-b border-line px-4" aria-hidden>
          <span className="size-3 rounded-full bg-[#ff5f57]/80" />
          <span className="size-3 rounded-full bg-[#febc2e]/80" />
          <span className="size-3 rounded-full bg-[#28c840]/80" />
          <span className="ml-3 h-6 flex-1 rounded-full bg-canvas" />
        </div>
        <div className="relative p-4 sm:p-6" aria-hidden>
          <div className="relative aspect-video overflow-hidden rounded-panel bg-[linear-gradient(135deg,#2a2a2a_0%,#161616_55%,#1f1f1f_100%)]">
            <div className="absolute inset-0 grid place-items-center">
              <Play className="size-10 fill-white/80 text-white/80" />
            </div>
            <div className="absolute inset-x-4 bottom-3 h-1 rounded-full bg-white/20">
              <div className="h-full w-1/3 rounded-full bg-white/80" />
            </div>
            <span className="material absolute top-3 right-3 grid size-10 place-items-center rounded-full ring-1 ring-white/15">
              <LogoMark className="size-6" />
            </span>
            <div className="material absolute top-16 right-3 w-[min(240px,70%)] rounded-[1rem] border border-white/10 p-3 shadow-pop">
              <p className="text-xs font-semibold text-ink">Save this video</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                <li className="flex items-center justify-between rounded-lg bg-white/10 px-2 py-1.5 text-ink">
                  <span className="flex items-center gap-1.5">
                    <Check className="size-3 text-accent" /> MP4, 1080p
                  </span>
                  <span className="text-ink-muted">48 MB</span>
                </li>
                <li className="flex items-center justify-between px-2 py-1.5 text-ink-muted">
                  <span>WebM, 720p</span>
                  <span>21 MB</span>
                </li>
              </ul>
              <div className="mt-2 rounded-full bg-ink py-1.5 text-center text-xs font-semibold text-canvas">Download</div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-ink-faint">Concept of the extension button and picker. Not yet released.</figcaption>
    </figure>
  );
}
