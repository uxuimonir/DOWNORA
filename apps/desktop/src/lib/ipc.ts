/**
 * Typed wrappers around Downora's Rust commands. These are the only calls the
 * window can make (see src-tauri/capabilities/default.json).
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type Container = 'mp4' | 'webm' | 'mkv' | 'mp3' | 'wav' | 'm4a';
export type Kind = 'video' | 'audio';
export type Status = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled';
export type Preset = 'high' | 'balanced' | 'small';

export interface Job {
  id: string;
  url: string;
  title: string;
  stem: string;
  dir: string;
  path: string | null;
  container: Container | null;
  kind: Kind | null;
  quality: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  thumbnail: string | null;
  status: Status;
  bytesReceived: number;
  bytesTotal: number | null;
  speedBps: number | null;
  etaSec: number | null;
  resumable: boolean | null;
  error: string | null;
  source: { type: 'app' } | { type: 'browser'; origin: string };
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Analysis {
  url: string;
  title: string;
  host: string;
  container: Container | null;
  kind: Kind | null;
  sizeBytes: number | null;
  resumable: boolean;
  width: number | null;
  height: number | null;
  quality: string | null;
  durationSec: number | null;
}

export interface Conversion {
  id: string;
  input: string;
  output: string;
  format: Container;
  preset: Preset;
  status: 'running' | 'completed' | 'failed' | 'canceled';
  progress: number | null;
  error: string | null;
  sizeBytes: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ProbeInfo {
  formatName: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  sizeBytes: number | null;
}

export interface OutputSupport {
  container: Container;
  available: boolean;
  encoders: string | null;
  missing: string | null;
}

export interface Settings {
  downloadDir: string;
  askWhereToSave: boolean;
  nameTemplate: 'title' | 'title-quality' | 'title-date';
  duplicates: 'rename' | 'replace';
  concurrency: number;
  bandwidthLimitKib: number;
  notifications: {
    downloadComplete: boolean;
    downloadFailed: boolean;
    conversionComplete: boolean;
    lowStorage: boolean;
    browserLost: boolean;
  };
  launchAtStartup: boolean;
  minimizeToTray: boolean;
  browserBridge: boolean;
  ffmpegPath: string | null;
}

export interface AppInfo {
  version: string;
  platform: string;
  ffmpeg: { ffmpeg: string; ffprobe: string; version: string } | null;
  outputs: OutputSupport[];
  secretStorage: string;
  bridgePort: number;
  bridgeError: string | null;
  browserConnected: boolean;
  autostartSupported: boolean;
  updates: string;
}

export interface StorageInfo {
  downloadDir: string;
  freeBytes: number | null;
  totalBytes: number | null;
}

export interface Browser {
  keyId: string;
  origin: string;
  clientName: string;
  pairedAt: string;
  rotatedAt: string;
  lastSeen: string | null;
}

export type EngineEvent =
  | { type: 'job'; job: Job }
  | { type: 'jobRemoved'; id: string }
  | { type: 'conversion'; conversion: Conversion }
  | { type: 'pairRequest'; requestId: string; origin: string; clientName: string }
  | { type: 'pairingChanged' }
  | { type: 'browserConnection'; connected: boolean }
  | { type: 'notice'; kind: string; title: string; body: string };

export type ConvertResult =
  | { result: 'started'; conversion: Conversion }
  | { result: 'needsConfirmation'; message: string };

export const api = {
  appInfo: () => invoke<AppInfo>('app_info'),
  getSettings: () => invoke<Settings>('get_settings'),
  updateSettings: (settings: Settings) => invoke<Settings>('update_settings', { settings }),
  storageInfo: () => invoke<StorageInfo>('storage_info'),
  pickFolder: (title?: string) => invoke<string | null>('pick_folder', { title }),
  pickMediaFiles: () => invoke<string[]>('pick_media_files'),
  analyzeUrl: (url: string) => invoke<Analysis>('analyze_url', { url }),
  addDownload: (a: { url: string; title?: string; container?: Container | null; quality?: string | null; dir?: string | null }) =>
    invoke<Job>('add_download', a),
  listDownloads: () => invoke<Job[]>('list_downloads'),
  pause: (id: string) => invoke<void>('pause_download', { id }),
  resume: (id: string) => invoke<void>('resume_download', { id }),
  cancel: (id: string) => invoke<void>('cancel_download', { id }),
  retry: (id: string) => invoke<void>('retry_download', { id }),
  remove: (id: string) => invoke<void>('remove_download', { id }),
  clearFinished: () => invoke<void>('clear_finished_downloads'),
  openFile: (id: string) => invoke<void>('open_download', { id }),
  reveal: (id: string) => invoke<void>('reveal_download', { id }),
  openFolder: () => invoke<void>('open_download_folder'),
  thumbnail: (id: string) => invoke<string | null>('download_thumbnail', { id }),
  probeFile: (path: string) => invoke<ProbeInfo>('probe_file', { path }),
  convert: (request: { input: string; outputDir: string; format: Container; preset: Preset; overwrite: boolean }) =>
    invoke<ConvertResult>('convert', { request }),
  listConversions: () => invoke<Conversion[]>('list_conversions'),
  cancelConversion: (id: string) => invoke<boolean>('cancel_conversion', { id }),
  clearConversions: () => invoke<void>('clear_conversions'),
  revealConversion: (id: string) => invoke<void>('reveal_conversion', { id }),
  startPairing: () => invoke<{ code: string; expiresAt: string }>('start_pairing'),
  cancelPairing: () => invoke<void>('cancel_pairing'),
  decidePairing: (requestId: string, approve: boolean) => invoke<boolean>('decide_pairing', { requestId, approve }),
  listBrowsers: () => invoke<Browser[]>('list_browsers'),
  revokeBrowser: (keyId: string) => invoke<void>('revoke_browser', { keyId }),
};

export function onEngineEvent(handler: (e: EngineEvent) => void): Promise<UnlistenFn> {
  return listen<EngineEvent>('downora://event', (e) => handler(e.payload));
}

/** Tauri rejects with a plain string from our commands. */
export function errorText(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : 'Something went wrong.';
}
