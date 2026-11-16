/**
 * In-browser media analysis.
 *
 * Everything here runs against the real link: a HEAD (or 1-byte ranged GET)
 * request for size and type, then a media element that loads only metadata
 * for duration and resolution. Nothing is guessed — fields the source does
 * not reveal stay undefined and the UI says so.
 */
import {
  matchMime,
  matchUrl,
  namesFromPath,
  normalizeMime,
  qualityLabelFor,
  validateMediaUrl,
} from '@downora/source-adapters';
import type { MediaAnalysis, MediaFormat, MediaKind } from '@downora/types';

export type AnalyzeErrorCode =
  | 'invalid_url'
  | 'unsupported'
  | 'not_media'
  | 'http'
  | 'unreachable'
  | 'timeout'
  | 'aborted';

export class AnalyzeError extends Error {
  constructor(
    public readonly code: AnalyzeErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'AnalyzeError';
  }
}

interface HeadProbe {
  /** False when the browser refused the request (CORS) or the network failed. */
  readable: boolean;
  status?: number;
  contentType?: string;
  sizeBytes?: number;
  ranges: boolean | null;
}

async function probeHeaders(url: URL, signal: AbortSignal): Promise<HeadProbe> {
  const read = (res: Response, viaRange: boolean): HeadProbe => {
    const contentRange = res.headers.get('content-range');
    const total = contentRange?.match(/\/(\d+)\s*$/)?.[1];
    const length = res.headers.get('content-length');
    const sizeBytes = viaRange && total ? Number(total) : !viaRange && length ? Number(length) : undefined;
    return {
      readable: true,
      status: res.status,
      contentType: res.headers.get('content-type') ?? undefined,
      sizeBytes: sizeBytes && Number.isFinite(sizeBytes) ? sizeBytes : undefined,
      ranges: viaRange ? res.status === 206 : res.headers.get('accept-ranges')?.includes('bytes') ? true : null,
    };
  };

  try {
    const head = await fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit', redirect: 'follow', signal });
    if (head.status !== 405 && head.status !== 501) return read(head, false);
    // Some servers refuse HEAD. Ask for one byte instead.
    const ranged = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { Range: 'bytes=0-0' },
      signal,
    });
    void ranged.body?.cancel();
    return read(ranged, ranged.status === 206);
  } catch (error) {
    if (signal.aborted) throw new AnalyzeError('aborted', 'Analysis canceled.');
    void error;
    return { readable: false, ranges: null };
  }
}

interface ElementProbe {
  durationSec?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  playable: boolean;
}

function probeElement(
  src: string,
  kind: MediaKind,
  allowFrameCapture: boolean,
  signal: AbortSignal,
  timeoutMs = 15_000,
): Promise<ElementProbe> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.muted = true;
    if (allowFrameCapture) el.crossOrigin = 'anonymous';

    let settled = false;
    const cleanup = () => {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      el.removeAttribute('src');
      el.load();
    };
    const finish = (value: ElementProbe) => {
      if (settled) return;
      cleanup();
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(new AnalyzeError('aborted', 'Analysis canceled.'));
    signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => finish({ playable: false }), timeoutMs);

    el.addEventListener('error', () => finish({ playable: false }), { once: true });
    el.addEventListener(
      'loadedmetadata',
      () => {
        const base: ElementProbe = {
          playable: true,
          durationSec: Number.isFinite(el.duration) ? el.duration : undefined,
        };
        if (!(el instanceof HTMLVideoElement)) return finish(base);
        base.width = el.videoWidth || undefined;
        base.height = el.videoHeight || undefined;
        if (!allowFrameCapture || !base.width) return finish(base);

        // Grab a preview frame a little way in, so it isn't a black first frame.
        const target = Math.min(1.2, (base.durationSec ?? 2) * 0.15);
        const capture = () => {
          try {
            const width = 320;
            const height = Math.round((width * (base.height ?? 9)) / (base.width ?? 16));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d')?.drawImage(el, 0, 0, width, height);
            base.thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          } catch {
            /* tainted canvas: the server did not allow frame access */
          }
          finish(base);
        };
        el.addEventListener('seeked', capture, { once: true });
        setTimeout(() => finish(base), 4000);
        el.currentTime = target;
      },
      { once: true },
    );
    el.src = src;
  });
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function analyzeUrl(input: string, signal: AbortSignal): Promise<MediaAnalysis> {
  const validation = validateMediaUrl(input);
  if (!validation.ok) throw new AnalyzeError('invalid_url', validation.message);
  const { url } = validation;

  const head = await probeHeaders(url, signal);

  if (head.readable && head.status && head.status >= 400) {
    throw new AnalyzeError(
      'http',
      head.status === 404
        ? 'Nothing was found at this link (error 404).'
        : head.status === 401 || head.status === 403
          ? `The server refused access to this file (error ${head.status}).`
          : `The server answered with error ${head.status}.`,
      head.status === 401 || head.status === 403
        ? 'Downora only saves files that are publicly available. It never signs in on your behalf.'
        : 'Check the link and try again.',
    );
  }

  const mime = head.contentType ? normalizeMime(head.contentType) : undefined;
  if (mime && (mime === 'text/html' || mime === 'application/xhtml+xml')) {
    throw new AnalyzeError(
      'not_media',
      'This link opens a web page, not a media file.',
      'Paste the direct link to the file itself — it usually ends in .mp4, .webm, .mp3, .m4a or .wav.',
    );
  }
  if (mime && (mime.includes('mpegurl') || mime === 'application/dash+xml')) {
    throw new AnalyzeError(
      'unsupported',
      'This is a streaming playlist, not a single file.',
      'Streaming playlists (HLS and DASH) are not supported yet.',
    );
  }

  const match = (mime ? matchMime(mime) : null) ?? matchUrl(url);
  if (!match) {
    throw new AnalyzeError(
      'unsupported',
      mime ? `Downora can’t save this type of file yet (${mime}).` : 'Downora doesn’t recognise this link as a supported media file.',
      'Supported today: direct links to MP4, WebM, MP3, M4A and WAV files.',
    );
  }

  const element = await probeElement(url.href, match.kind, head.readable, signal);

  if (!head.readable && !element.playable) {
    throw new AnalyzeError(
      'unreachable',
      'Downora couldn’t reach this file.',
      'The link may be broken, offline, or only work after signing in on that site.',
    );
  }

  const { title, baseName } = namesFromPath(url.pathname);
  const qualityLabel =
    match.kind === 'video' && element.width && element.height
      ? qualityLabelFor(element.width, element.height)
      : undefined;

  const original: MediaFormat = {
    id: 'original',
    kind: match.kind,
    container: match.container,
    delivery: 'original',
    qualityLabel,
    width: element.width,
    height: element.height,
    sizeBytes: head.sizeBytes,
    mimeType: mime,
  };

  return {
    id: makeId(),
    sourceUrl: url.href,
    sourceHost: url.host,
    adapterId: match.adapterId,
    kind: match.kind,
    title,
    baseName,
    durationSec: element.durationSec,
    width: element.width,
    height: element.height,
    mimeType: mime,
    sizeBytes: head.sizeBytes,
    thumbnail: element.thumbnail,
    playable: element.playable,
    formats: [original],
    access: { transfer: head.readable ? 'direct' : 'blocked', ranges: head.ranges },
    analyzedAt: new Date().toISOString(),
  };
}
