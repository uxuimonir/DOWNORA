/**
 * Media detection. Looks only at <video>/<audio> elements and their <source>
 * children — no other page content is read or sent anywhere.
 *
 * Skipped on purpose:
 * - blob:, data: and MediaSource URLs (adaptive streams, often DRM-protected)
 * - files whose type Downora doesn't support (HLS/DASH playlists, MKV, …)
 * - players too small to be the main content (ads, previews, thumbnails)
 */
import { matchMime, matchUrl, namesFromPath, validateMediaUrl } from '@downora/source-adapters';
import type { DetectedMedia, DetectedSource } from '@downora/types';

/** Smallest player that gets a button (ads and hover previews are usually smaller). */
export const MIN_VIDEO = { width: 200, height: 112 } as const;

const ids = new WeakMap<Element, string>();
let counter = 0;

export function elementId(el: Element): string {
  let id = ids.get(el);
  if (!id) {
    counter += 1;
    id = `dm-${counter}`;
    ids.set(el, id);
  }
  return id;
}

function absolute(src: string, base: string): string | null {
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}

/** Height stated on a <source> by common players (`size="720"`, `data-res`, `label="1080p"`). */
function statedHeight(source: Element): number | undefined {
  for (const attr of ['size', 'res', 'data-res', 'data-quality', 'label', 'title']) {
    const v = source.getAttribute(attr);
    const m = v?.match(/^\s*(\d{3,4})\s*p?\s*$/i) ?? v?.match(/(\d{3,4})p\b/i);
    if (m?.[1]) {
      const h = Number(m[1]);
      if (h >= 144 && h <= 4320) return h;
    }
  }
  return undefined;
}

export function sourcesOf(el: HTMLMediaElement, base: string): DetectedSource[] {
  const out: DetectedSource[] = [];
  const seen = new Set<string>();
  const current = el.currentSrc || el.src;

  const add = (raw: string | null, typeAttr: string | null, height?: number) => {
    if (!raw) return;
    const href = absolute(raw, base);
    if (!href || seen.has(href)) return;
    const v = validateMediaUrl(href);
    if (!v.ok || !/^https?:$/.test(v.url.protocol)) return; // drops blob:, data:, mediasource:
    const match = matchUrl(v.url) ?? (typeAttr ? matchMime(typeAttr) : null);
    if (!match) return;
    seen.add(href);
    out.push({ src: href, kind: match.kind, container: match.container, height, current: href === current });
  };

  add(el.getAttribute('src'), el.getAttribute('type'));
  if (el.currentSrc) add(el.currentSrc, null);
  for (const s of el.querySelectorAll('source')) add(s.getAttribute('src'), s.getAttribute('type'), statedHeight(s));

  // The playing file's real height beats anything stated in markup.
  if (el instanceof HTMLVideoElement && el.videoHeight) {
    for (const s of out) if (s.current) s.height = el.videoHeight;
  }
  // Highest stated quality first, the playing file breaking ties.
  return out.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || Number(b.current) - Number(a.current));
}

function titleOf(el: HTMLMediaElement, sources: DetectedSource[]): string {
  const caption = el.closest('figure')?.querySelector('figcaption')?.textContent;
  const fromUrl = sources[0] ? namesFromPath(new URL(sources[0].src).pathname).title : '';
  const candidates = [el.getAttribute('aria-label'), el.getAttribute('title'), el.dataset.title, caption, fromUrl];
  const pick = candidates.find((c) => c && c.trim().length > 1)?.trim() ?? 'Untitled media';
  return pick.replace(/\s+/g, ' ').slice(0, 200);
}

export function isLargeEnough(el: HTMLMediaElement): boolean {
  const r = el.getBoundingClientRect();
  if (el instanceof HTMLAudioElement) return r.width > 0 && r.height > 0;
  return r.width >= MIN_VIDEO.width && r.height >= MIN_VIDEO.height;
}

export function describe(el: HTMLMediaElement, base: string): DetectedMedia | null {
  const sources = sourcesOf(el, base);
  if (sources.length === 0) return null;
  const isVideo = el instanceof HTMLVideoElement;
  const posterAttr = isVideo ? el.getAttribute('poster') : null;
  const poster = posterAttr ? absolute(posterAttr, base) : null;
  return {
    elementId: elementId(el),
    kind: isVideo ? 'video' : 'audio',
    title: titleOf(el, sources),
    poster: poster && /^https?:/.test(poster) ? poster : undefined,
    width: isVideo && el.videoWidth ? el.videoWidth : undefined,
    height: isVideo && el.videoHeight ? el.videoHeight : undefined,
    durationSec: Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 10) / 10 : undefined,
    sources,
  };
}

export interface Detection {
  el: HTMLMediaElement;
  media: DetectedMedia;
}

/** One pass over the page's media elements. Cheap: a single querySelectorAll. */
export function scan(root: Document = document): Detection[] {
  const out: Detection[] = [];
  for (const el of root.querySelectorAll<HTMLMediaElement>('video, audio')) {
    if (!el.isConnected || !isLargeEnough(el)) continue;
    const media = describe(el, root.baseURI);
    if (media) out.push({ el, media });
  }
  return out;
}

/**
 * Re-scans when media elements are added, removed or change source.
 * Batches bursts of DOM changes into one scan.
 */
export function watch(onChange: (detections: Detection[]) => void, root: Document = document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  const run = () => {
    timer = undefined;
    const detections = scan(root);
    const key = JSON.stringify(detections.map((d) => d.media));
    if (key !== last) {
      last = key;
      onChange(detections);
    }
  };
  const schedule = () => {
    if (timer === undefined) timer = setTimeout(run, 250);
  };

  const touchesMedia = (n: Node) =>
    n instanceof Element && (n.matches('video, audio, source') || n.querySelector('video, audio') !== null);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' || [...r.addedNodes].some(touchesMedia) || [...r.removedNodes].some(touchesMedia)) {
        schedule();
        return;
      }
    }
  });
  observer.observe(root.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'poster'],
  });
  // Media events don't bubble, but they do pass through the capture phase.
  const events = ['loadedmetadata', 'emptied', 'resize'] as const;
  for (const e of events) root.addEventListener(e, schedule, true);
  const onResize = () => schedule();
  root.defaultView?.addEventListener('resize', onResize);

  run();
  return () => {
    observer.disconnect();
    for (const e of events) root.removeEventListener(e, schedule, true);
    root.defaultView?.removeEventListener('resize', onResize);
    if (timer !== undefined) clearTimeout(timer);
  };
}
