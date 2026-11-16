import type { Container, MediaKind, SourceAdapterDescriptor } from '@downora/types';
import { extensionOf } from './url';

export interface AdapterMatch {
  adapterId: string;
  kind: MediaKind;
  container: Container;
  /** What the match was based on. */
  via: 'extension' | 'mime' | 'file';
}

/**
 * A source adapter declares what it supports and decides whether it can handle
 * a given input. Adapters are pure and isomorphic: fetching bytes is the job of
 * an engine (browser, API, extension), never of the adapter.
 */
export interface SourceAdapter extends SourceAdapterDescriptor {
  matchUrl(url: URL): AdapterMatch | null;
  matchMime(mime: string): AdapterMatch | null;
}

interface TypeRule {
  container: Container;
  kind: MediaKind;
  extensions: string[];
  mimes: string[];
}

function fileTypeAdapter(
  descriptor: SourceAdapterDescriptor,
  rules: TypeRule[],
): SourceAdapter {
  const byExtension = new Map<string, TypeRule>();
  const byMime = new Map<string, TypeRule>();
  for (const rule of rules) {
    for (const ext of rule.extensions) byExtension.set(ext, rule);
    for (const mime of rule.mimes) byMime.set(mime, rule);
  }
  return {
    ...descriptor,
    matchUrl(url) {
      const ext = extensionOf(url);
      const rule = ext ? byExtension.get(ext) : undefined;
      return rule
        ? { adapterId: descriptor.id, kind: rule.kind, container: rule.container, via: 'extension' }
        : null;
    },
    matchMime(mime) {
      const rule = byMime.get(normalizeMime(mime));
      return rule
        ? { adapterId: descriptor.id, kind: rule.kind, container: rule.container, via: 'mime' }
        : null;
    },
  };
}

export function normalizeMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

const VIDEO_RULES: TypeRule[] = [
  { container: 'mp4', kind: 'video', extensions: ['mp4', 'm4v'], mimes: ['video/mp4'] },
  { container: 'webm', kind: 'video', extensions: ['webm'], mimes: ['video/webm'] },
];

const AUDIO_RULES: TypeRule[] = [
  { container: 'mp3', kind: 'audio', extensions: ['mp3'], mimes: ['audio/mpeg', 'audio/mp3'] },
  {
    container: 'wav',
    kind: 'audio',
    extensions: ['wav'],
    mimes: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
  },
  {
    container: 'm4a',
    kind: 'audio',
    extensions: ['m4a'],
    mimes: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'],
  },
];

export const directVideoAdapter = fileTypeAdapter(
  {
    id: 'direct-video',
    name: 'Direct video files',
    summary: 'Links that point straight at an MP4 or WebM file on any site.',
    domains: '*',
    kinds: ['video'],
    detection: ['File extension in the link (.mp4, .m4v, .webm)', 'Content-Type reported by the server'],
    metadata: ['Resolution', 'Duration', 'File size, when the server reports it', 'Preview frame, when the server allows it'],
    permission: 'direct-file',
    permissionNote:
      'Saves the file exactly as the server sends it to anyone with the link. No sign-in, DRM or paywall is bypassed.',
    formats: ['mp4', 'webm'],
    status: 'available',
  },
  VIDEO_RULES,
);

export const directAudioAdapter = fileTypeAdapter(
  {
    id: 'direct-audio',
    name: 'Direct audio files',
    summary: 'Links that point straight at an MP3, M4A or WAV file on any site.',
    domains: '*',
    kinds: ['audio'],
    detection: ['File extension in the link (.mp3, .m4a, .wav)', 'Content-Type reported by the server'],
    metadata: ['Duration', 'File size, when the server reports it'],
    permission: 'direct-file',
    permissionNote:
      'Saves the file exactly as the server sends it to anyone with the link. No sign-in, DRM or paywall is bypassed.',
    formats: ['mp3', 'm4a', 'wav'],
    status: 'available',
  },
  AUDIO_RULES,
);

/**
 * Files already on the user's device. In the web app this adapter inspects a
 * file (resolution, duration, size). Converting it needs the media engine.
 */
export const localFileAdapter: SourceAdapter = {
  id: 'local-file',
  name: 'Files on this device',
  summary: 'Video and audio files you already have. Downora reads them locally; nothing is uploaded.',
  domains: [],
  kinds: ['video', 'audio'],
  detection: ['File type of the file you choose'],
  metadata: ['Resolution', 'Duration', 'File size'],
  permission: 'user-owned',
  permissionNote: 'The file is yours and never leaves your device.',
  formats: ['mp4', 'webm', 'mp3', 'm4a', 'wav'],
  status: 'limited',
  statusNote: 'Inspection only. Converting between formats arrives with the conversion service.',
  matchUrl: () => null,
  matchMime(mime) {
    const match = directVideoAdapter.matchMime(mime) ?? directAudioAdapter.matchMime(mime);
    return match ? { ...match, adapterId: 'local-file', via: 'file' } : null;
  },
};
