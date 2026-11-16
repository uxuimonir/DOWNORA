/**
 * @downora/types — the shared domain model.
 *
 * Every surface (web, API, extension, desktop) speaks these types. Keep this
 * package free of runtime dependencies so it can be imported anywhere.
 */

// ───────────────────────────── Media ─────────────────────────────

export type MediaKind = 'video' | 'audio';

export const VIDEO_CONTAINERS = ['mp4', 'webm', 'mkv'] as const;
export const AUDIO_CONTAINERS = ['mp3', 'wav', 'm4a'] as const;
export const CONTAINERS = [...VIDEO_CONTAINERS, ...AUDIO_CONTAINERS] as const;

export type VideoContainer = (typeof VIDEO_CONTAINERS)[number];
export type AudioContainer = (typeof AUDIO_CONTAINERS)[number];
export type Container = (typeof CONTAINERS)[number];

/** The quality tiers Downora names. Anything below 480p is labelled by its pixel height. */
export const QUALITY_TIERS = [
  { label: '8K', shortSide: 4320, width: 7680, height: 4320 },
  { label: '4K', shortSide: 2160, width: 3840, height: 2160 },
  { label: '2K', shortSide: 1440, width: 2560, height: 1440 },
  { label: '1080p', shortSide: 1080, width: 1920, height: 1080 },
  { label: '720p', shortSide: 720, width: 1280, height: 720 },
  { label: '480p', shortSide: 480, width: 854, height: 480 },
] as const;

export type QualityLabel = (typeof QUALITY_TIERS)[number]['label'] | `${number}p`;

/**
 * How a format is produced.
 * - `original`: the source file, byte for byte.
 * - `transcode`: converted by the media engine (FFmpeg). Not available until
 *   the conversion service is connected.
 */
export type FormatDelivery = 'original' | 'transcode';

export interface MediaFormat {
  id: string;
  kind: MediaKind;
  container: Container;
  delivery: FormatDelivery;
  qualityLabel?: QualityLabel;
  width?: number;
  height?: number;
  /** Exact size when the source reports it; otherwise undefined — never guessed. */
  sizeBytes?: number;
  mimeType?: string;
}

/** What Downora could learn about how the source may be accessed. */
export interface SourceAccess {
  /**
   * `direct`  — the current engine can read the bytes itself.
   * `blocked` — the server refuses cross-origin reads (web engine only).
   */
  transfer: 'direct' | 'blocked';
  /** Whether the server answered a Range request. `null` when unknown. */
  ranges: boolean | null;
}

export interface MediaAnalysis {
  id: string;
  sourceUrl: string;
  /** Host shown to the user, e.g. `media.example.com`. `This device` for local files. */
  sourceHost: string;
  adapterId: string;
  kind: MediaKind;
  title: string;
  /** File name without extension, already sanitised for saving. */
  baseName: string;
  durationSec?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  sizeBytes?: number;
  /** Small JPEG data URL, only when the source allowed a frame capture. */
  thumbnail?: string;
  /** False when the current browser cannot decode the file (it can still be saved). */
  playable: boolean;
  formats: MediaFormat[];
  access: SourceAccess;
  analyzedAt: string;
}

// ─────────────────────────── Downloads ───────────────────────────

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled';

export type DownloadErrorCode =
  | 'network'
  | 'http'
  | 'incomplete'
  | 'too_large'
  | 'interrupted'
  | 'blocked'
  | 'unknown';

export interface DownloadJob {
  id: string;
  sourceUrl: string;
  sourceHost: string;
  adapterId: string;
  kind: MediaKind;
  title: string;
  fileName: string;
  container: Container;
  qualityLabel?: QualityLabel;
  durationSec?: number;
  thumbnail?: string;
  status: DownloadStatus;
  bytesReceived: number;
  /** Undefined when the server does not report a length. */
  bytesTotal?: number;
  /** Rolling average, bytes per second. Only meaningful while downloading. */
  speedBps?: number;
  etaSec?: number;
  /** Whether the server honoured a Range request on the last attempt. */
  resumable?: boolean;
  errorCode?: DownloadErrorCode;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

// ───────────────────────── Source adapters ─────────────────────────

export type AdapterStatus = 'available' | 'limited' | 'planned';

/** Who is allowed to trigger a download through an adapter, and why it is permitted. */
export type DownloadPermission =
  /** A plain media file served over HTTP(S) that the user already has the link to. */
  | 'direct-file'
  /** A file that already lives on the user's device. */
  | 'user-owned'
  /** A third-party service with a documented, permitted download API. */
  | 'licensed-api';

export interface SourceAdapterDescriptor {
  id: string;
  name: string;
  summary: string;
  /** `*` means any host, matched by file type instead of by domain. */
  domains: string[] | '*';
  kinds: MediaKind[];
  detection: string[];
  metadata: string[];
  permission: DownloadPermission;
  permissionNote: string;
  formats: Container[];
  status: AdapterStatus;
  statusNote?: string;
}

// ──────────────────────────── Settings ────────────────────────────

export type FileNamePattern = 'original' | 'with-quality' | 'with-date';
export type MotionPreference = 'system' | 'reduce' | 'full';

export interface UserSettings {
  /** How many transfers run at once (1–4). */
  concurrency: number;
  /** Start a download as soon as it is added, or leave it queued. */
  autoStart: boolean;
  fileNamePattern: FileNamePattern;
  /** Largest file the in-browser engine will buffer, in megabytes. */
  maxBrowserFileMb: number;
  notifyOnComplete: boolean;
  motion: MotionPreference;
  /** Finished items kept in history before the oldest are dropped. */
  historyLimit: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  concurrency: 2,
  autoStart: true,
  fileNamePattern: 'original',
  maxBrowserFileMb: 1024,
  notifyOnComplete: false,
  motion: 'system',
  historyLimit: 200,
};

// ───────────────────── REST contract (Phase 3) ─────────────────────
// The web app's API client is typed against these. The API implements them in
// Phase 3; until then only /api/health and /api/sources are served.

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface HealthResponse {
  status: 'ok';
  service: 'downora-api';
  version: string;
  /** Capabilities the running server actually has. */
  capabilities: { analyze: boolean; downloads: boolean; transcode: boolean; auth: boolean };
}

export interface AnalyzeRequest {
  url: string;
}
export type AnalyzeResponse = MediaAnalysis;

export interface FormatsResponse {
  mediaId: string;
  formats: MediaFormat[];
}

export interface CreateDownloadRequest {
  mediaId: string;
  formatId: string;
  fileName?: string;
}
export type DownloadResponse = DownloadJob;

export interface ListDownloadsResponse {
  items: DownloadJob[];
  nextCursor?: string;
}

export interface SourcesResponse {
  sources: SourceAdapterDescriptor[];
}

export type UserSettingsResponse = UserSettings;

// ─────────────────────── Extension (Phase 5) ───────────────────────
// Content script ⇄ service worker ⇄ popup. Every message is validated on
// arrival (apps/extension/src/shared/messages.ts); these are the shapes.

/** One playable file offered by a media element (its src, or a <source> child). */
export interface DetectedSource {
  src: string;
  kind: MediaKind;
  container: Container;
  /** Only when the element or the page states it (e.g. `size="720"`). Never guessed. */
  height?: number;
  /** True for the file the element is actually playing. */
  current: boolean;
}

export interface DetectedMedia {
  /** Stable per-page id for the media element. */
  elementId: string;
  kind: MediaKind;
  title: string;
  /** Poster image URL from the element, when it has one. */
  poster?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  sources: DetectedSource[];
}

export interface ExtensionDownload {
  /** chrome.downloads id. */
  id: number;
  url: string;
  fileName: string;
  title: string;
  kind: MediaKind;
  container: Container;
  pageHost: string;
  state: 'in_progress' | 'interrupted' | 'complete';
  paused: boolean;
  bytesReceived: number;
  bytesTotal?: number;
  error?: string;
  startedAt: string;
  endedAt?: string;
}
