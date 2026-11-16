/**
 * Every message between content script, service worker and popup.
 *
 * Messages are untrusted input: a compromised page cannot send to the service
 * worker directly, but a content script runs inside hostile pages, so the
 * worker validates every field before acting on it.
 */
import { matchMime, matchUrl, validateMediaUrl } from '@downora/source-adapters';
import { CONTAINERS, type Container, type DetectedMedia, type DetectedSource, type ExtensionDownload, type MediaKind } from '@downora/types';

export interface ProbeResult {
  ok: boolean;
  sizeBytes?: number;
  contentType?: string;
  /** Plain-language reason when `ok` is false. */
  error?: string;
}

export interface DownloadRequest {
  url: string;
  title: string;
  container: Container;
  kind: MediaKind;
}

export type TabAccess =
  /** Detection runs automatically on this site. */
  | 'enabled'
  /** The extension has no access; the user can turn it on or scan once. */
  | 'off'
  /** chrome://, the Web Store and similar pages where extensions can't run. */
  | 'restricted';

export interface TabState {
  tabId: number;
  url?: string;
  origin?: string;
  access: TabAccess;
  /** False until a content script has reported from this tab. */
  scanned: boolean;
  media: DetectedMedia[];
}

// Content script → worker
export type ContentMessage =
  | { type: 'media/update'; media: DetectedMedia[] }
  | { type: 'media/probe'; url: string }
  | { type: 'download/start'; request: DownloadRequest }
  | { type: 'dashboard/open'; url: string };

// Popup → worker
export type PopupMessage =
  | { type: 'tab/state'; tabId: number }
  | { type: 'tab/scan'; tabId: number }
  | { type: 'site/enabled'; origin: string }
  | { type: 'site/disable'; origin: string }
  | { type: 'download/start'; request: DownloadRequest; tabId?: number }
  | { type: 'downloads/list' }
  | { type: 'downloads/retry'; id: number }
  | { type: 'downloads/cancel'; id: number }
  | { type: 'downloads/clear' }
  | { type: 'downloads/show'; id: number };

// Worker → content script / popup
export type WorkerEvent = { type: 'downloads/changed'; downloads: ExtensionDownload[] };

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ───────────────────────── validation ─────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 4096): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isOptNum = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7);
const isKind = (v: unknown): v is MediaKind => v === 'video' || v === 'audio';
const isContainer = (v: unknown): v is Container => typeof v === 'string' && (CONTAINERS as readonly string[]).includes(v);

/**
 * True when Downora may hand this URL to the downloader: http(s), no
 * credentials, and recognised as a supported file by extension or MIME.
 */
export function isSupportedMediaUrl(url: string, mime?: string): boolean {
  const v = validateMediaUrl(url);
  if (!v.ok || !/^https?:$/.test(v.url.protocol)) return false;
  return Boolean(matchUrl(v.url) ?? (mime ? matchMime(mime) : null));
}

function isSource(v: unknown): v is DetectedSource {
  return (
    isObj(v) &&
    isStr(v.src) &&
    isKind(v.kind) &&
    isContainer(v.container) &&
    isOptNum(v.height) &&
    typeof v.current === 'boolean' &&
    validateMediaUrl(v.src).ok
  );
}

export function isDetectedMedia(v: unknown): v is DetectedMedia {
  return (
    isObj(v) &&
    isStr(v.elementId, 64) &&
    isKind(v.kind) &&
    typeof v.title === 'string' &&
    v.title.length <= 300 &&
    (v.poster === undefined || (isStr(v.poster) && validateMediaUrl(v.poster).ok)) &&
    isOptNum(v.width) &&
    isOptNum(v.height) &&
    isOptNum(v.durationSec) &&
    Array.isArray(v.sources) &&
    v.sources.length > 0 &&
    v.sources.length <= 12 &&
    v.sources.every(isSource)
  );
}

export function isDownloadRequest(v: unknown): v is DownloadRequest {
  return (
    isObj(v) &&
    isStr(v.url) &&
    typeof v.title === 'string' &&
    v.title.length <= 300 &&
    isContainer(v.container) &&
    isKind(v.kind) &&
    isSupportedMediaUrl(v.url)
  );
}

export function parseContentMessage(v: unknown): ContentMessage | null {
  if (!isObj(v) || typeof v.type !== 'string') return null;
  switch (v.type) {
    case 'media/update':
      return Array.isArray(v.media) && v.media.length <= 50 && v.media.every(isDetectedMedia)
        ? { type: 'media/update', media: v.media }
        : null;
    case 'media/probe':
      return isStr(v.url) && isSupportedMediaUrl(v.url) ? { type: 'media/probe', url: v.url } : null;
    case 'download/start':
      return isDownloadRequest(v.request) ? { type: 'download/start', request: v.request } : null;
    case 'dashboard/open':
      return isStr(v.url) && validateMediaUrl(v.url).ok ? { type: 'dashboard/open', url: v.url } : null;
    default:
      return null;
  }
}

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function parsePopupMessage(v: unknown): PopupMessage | null {
  if (!isObj(v) || typeof v.type !== 'string') return null;
  switch (v.type) {
    case 'tab/state':
    case 'tab/scan':
      return isId(v.tabId) ? { type: v.type, tabId: v.tabId } : null;
    case 'site/enabled':
    case 'site/disable':
      return isStr(v.origin, 300) && /^https?:\/\/[^/]+$|^\*$/.test(v.origin) ? { type: v.type, origin: v.origin } : null;
    case 'download/start':
      return isDownloadRequest(v.request)
        ? { type: 'download/start', request: v.request, tabId: isId(v.tabId) ? v.tabId : undefined }
        : null;
    case 'downloads/list':
    case 'downloads/clear':
      return { type: v.type };
    case 'downloads/retry':
    case 'downloads/cancel':
    case 'downloads/show':
      return isId(v.id) ? { type: v.type, id: v.id } : null;
    default:
      return null;
  }
}
