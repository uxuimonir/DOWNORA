import {
  QUALITY_TIERS,
  type Container,
  type QualityLabel,
  type SourceAdapterDescriptor,
} from '@downora/types';
import {
  directAudioAdapter,
  directVideoAdapter,
  localFileAdapter,
  type AdapterMatch,
  type SourceAdapter,
} from './adapters';

export * from './adapters';
export * from './url';

/** Adapters that resolve remote links, in match order. */
const REMOTE_ADAPTERS: SourceAdapter[] = [directVideoAdapter, directAudioAdapter];

export const adapters: SourceAdapter[] = [...REMOTE_ADAPTERS, localFileAdapter];

export function getAdapter(id: string): SourceAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id);
}

export function matchUrl(url: URL): AdapterMatch | null {
  for (const adapter of REMOTE_ADAPTERS) {
    const match = adapter.matchUrl(url);
    if (match) return match;
  }
  return null;
}

export function matchMime(mime: string): AdapterMatch | null {
  for (const adapter of REMOTE_ADAPTERS) {
    const match = adapter.matchMime(mime);
    if (match) return match;
  }
  return null;
}

/** Serializable view of the registry, e.g. for `GET /api/sources`. */
export function describeAdapters(): SourceAdapterDescriptor[] {
  return adapters.map(({ matchUrl: _u, matchMime: _m, ...descriptor }) => descriptor);
}

/**
 * Sources Downora deliberately does not support. Listed in the product so the
 * boundary is explicit rather than discovered by trial and error.
 */
export const EXCLUDED_SOURCES: { name: string; reason: string }[] = [
  {
    name: 'DRM-protected streams',
    reason: 'Widevine, FairPlay and PlayReady content is encrypted on purpose. Downora never circumvents DRM.',
  },
  {
    name: 'Content behind a sign-in or paywall',
    reason: 'Downora does not read cookies, capture credentials or reuse your sessions to fetch media.',
  },
  {
    name: 'Streaming sites without a permitted download API',
    reason: 'A site is only added when its terms or a documented API explicitly allow downloading.',
  },
];

/** Names a resolution the way the product does: by the shorter side of the frame. */
export function qualityLabelFor(width: number, height: number): QualityLabel {
  const shortSide = Math.min(width, height);
  // A little tolerance so 1920×1072 or 3840×2076 still read as 1080p / 4K.
  for (const tier of QUALITY_TIERS) {
    if (shortSide >= tier.shortSide * 0.94) return tier.label;
  }
  return `${shortSide}p`;
}

const MIME_BY_CONTAINER: Record<Container, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

export function mimeForContainer(container: Container): string {
  return MIME_BY_CONTAINER[container];
}
