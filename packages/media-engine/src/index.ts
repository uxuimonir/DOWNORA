/**
 * @downora/media-engine — FFmpeg / FFprobe for the Downora API.
 *
 * - Only the FFmpeg binaries are executed (no shell); every argument is built
 *   here from validated values.
 * - Output formats are offered only when the installed FFmpeg has the
 *   encoders they need.
 * - Video is never upscaled.
 */
import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, rename, rm } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { QUALITY_TIERS, type Container, type MediaKind } from '@downora/types';

export interface ProbeResult {
  formatName: string;
  durationSec?: number;
  sizeBytes?: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
}

export interface Engine {
  ffmpeg: string;
  ffprobe: string;
  version: string;
  encoders: Set<string>;
}

export type Preset = 'high' | 'balanced' | 'small';

function run(bin: string, args: string[], timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
}

async function exists(p: string) {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function parseEncoders(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split('\n')) {
    const [flags, name] = line.trim().split(/\s+/);
    if (flags && name && flags.length === 6 && 'VAS'.includes(flags[0]!) && name !== '=') out.add(name);
  }
  return out;
}

/** Finds FFmpeg via FFMPEG_PATH or PATH. Returns null when it isn't installed. */
export async function discover(explicit = process.env.FFMPEG_PATH): Promise<Engine | null> {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const candidates = [explicit, ...(process.env.PATH ?? '').split(delimiter).map((d) => join(d, `ffmpeg${exe}`))].filter(Boolean) as string[];
  for (const ffmpeg of candidates) {
    const ffprobe = join(ffmpeg, '..', `ffprobe${exe}`);
    if (!(await exists(ffmpeg)) || !(await exists(ffprobe))) continue;
    try {
      const version = (await run(ffmpeg, ['-hide_banner', '-version'], 5000)).split('\n')[0]?.replace('ffmpeg version ', '').split(' ')[0] ?? '';
      const encoders = parseEncoders(await run(ffmpeg, ['-hide_banner', '-encoders'], 5000));
      return { ffmpeg, ffprobe, version, encoders };
    } catch {
      /* try next */
    }
  }
  return null;
}

const VIDEO_ENCODERS: Partial<Record<Container, string[]>> = {
  mp4: ['libx264', 'h264_videotoolbox', 'mpeg4'],
  mkv: ['libx264', 'h264_videotoolbox', 'mpeg4'],
  webm: ['libvpx-vp9', 'libvpx'],
};
const AUDIO_ENCODERS: Record<Container, string[]> = {
  mp4: ['aac'],
  mkv: ['aac'],
  m4a: ['aac'],
  webm: ['libopus', 'libvorbis'],
  mp3: ['libmp3lame'],
  wav: ['pcm_s16le'],
};

const pick = (e: Engine, list?: string[]) => list?.find((x) => e.encoders.has(x));

/** Containers this FFmpeg can write. */
export function outputs(e: Engine): Container[] {
  return (['mp4', 'webm', 'mkv', 'mp3', 'wav', 'm4a'] as Container[]).filter((c) => {
    const audio = pick(e, AUDIO_ENCODERS[c]);
    return VIDEO_ENCODERS[c] ? Boolean(pick(e, VIDEO_ENCODERS[c]) && audio) : Boolean(audio);
  });
}

export const kindOf = (c: Container): MediaKind => (c === 'mp4' || c === 'webm' || c === 'mkv' ? 'video' : 'audio');

export async function probe(e: Engine, input: string): Promise<ProbeResult> {
  const json = JSON.parse(await run(e.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input])) as {
    format?: { format_name?: string; duration?: string; size?: string };
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; disposition?: { attached_pic?: number } }[];
  };
  const r: ProbeResult = {
    formatName: json.format?.format_name ?? '',
    durationSec: json.format?.duration ? Number(json.format.duration) : undefined,
    sizeBytes: json.format?.size ? Number(json.format.size) : undefined,
  };
  for (const s of json.streams ?? []) {
    if (s.codec_type === 'video' && s.disposition?.attached_pic !== 1 && !r.videoCodec) {
      r.videoCodec = s.codec_name;
      r.width = s.width;
      r.height = s.height;
    } else if (s.codec_type === 'audio' && !r.audioCodec) {
      r.audioCodec = s.codec_name;
    }
  }
  if (!r.videoCodec && !r.audioCodec) throw new Error('No audio or video found.');
  return r;
}

/** Heights a source can be delivered at: its own, and lower named tiers. Never higher. */
export function heightsFor(sourceHeight: number): number[] {
  const tiers = QUALITY_TIERS.map((t) => t.shortSide as number).filter((h) => h < sourceHeight * 0.94);
  return [sourceHeight, ...tiers];
}

export interface ConvertOptions {
  input: string;
  output: string;
  container: Container;
  /** Target short-side height for video. Must not exceed the source. */
  height?: number;
  preset?: Preset;
  probe: ProbeResult;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

const MUXER: Record<Container, string> = { mp4: 'mp4', webm: 'webm', mkv: 'matroska', mp3: 'mp3', wav: 'wav', m4a: 'ipod' };

export function buildArgs(e: Engine, o: ConvertOptions, temp: string): string[] {
  const video = kindOf(o.container) === 'video';
  const p = (h: string, b: string, s: string) => (o.preset === 'high' ? h : o.preset === 'small' ? s : b);
  if (video && !o.probe.videoCodec) throw new Error(`This file has no video, so it can’t become ${o.container.toUpperCase()}.`);
  if (!video && !o.probe.audioCodec) throw new Error('This file has no audio track to extract.');
  if (!outputs(e).includes(o.container)) throw new Error(`This server’s FFmpeg can’t write ${o.container.toUpperCase()}.`);
  const args = ['-hide_banner', '-nostdin', '-y', '-i', o.input, '-map_metadata', '0'];
  if (video) {
    args.push('-map', '0:v:0', '-map', '0:a:0?');
    const venc = pick(e, VIDEO_ENCODERS[o.container])!;
    args.push('-c:v', venc);
    if (venc === 'libx264') args.push('-crf', p('20', '23', '28'), '-preset', p('slow', 'medium', 'veryfast'), '-pix_fmt', 'yuv420p');
    else if (venc.startsWith('libvpx')) args.push('-b:v', '0', '-crf', p('28', '33', '40'), '-row-mt', '1', '-deadline', 'good', '-cpu-used', p('2', '4', '5'));
    else args.push('-b:v', p('8M', '4M', '1500k'));
    const src = o.probe.height ?? 0;
    if (o.height && src && o.height > src) throw new Error('Downora never upscales video.');
    if (o.height && src && o.height < src) args.push('-vf', `scale=-2:${o.height}`);
    if (o.probe.audioCodec) args.push('-c:a', pick(e, AUDIO_ENCODERS[o.container])!, '-b:a', p('192k', '160k', '96k'));
    if (o.container === 'mp4') args.push('-movflags', '+faststart');
  } else {
    args.push('-map', '0:a:0', '-vn');
    if (o.container === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', p('0', '2', '5'));
    else if (o.container === 'wav') args.push('-c:a', 'pcm_s16le');
    else args.push('-c:a', pick(e, AUDIO_ENCODERS[o.container])!, '-b:a', p('256k', '192k', '128k'));
  }
  args.push('-f', MUXER[o.container], '-progress', 'pipe:1', '-nostats', temp);
  return args;
}

/** Converts via a temp file that is renamed on success; nothing is left behind on failure or cancel. */
export async function convert(e: Engine, o: ConvertOptions): Promise<void> {
  const temp = `${o.output}.part`;
  const args = buildArgs(e, o, temp);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(e.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let err = '';
      let buf = '';
      const onAbort = () => child.kill('SIGKILL');
      o.signal?.addEventListener('abort', onAbort, { once: true });
      child.stderr.on('data', (c: Buffer) => {
        err = (err + c.toString()).slice(-4000);
      });
      child.stdout.on('data', (c: Buffer) => {
        buf += c.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          const us = line.startsWith('out_time_us=') ? Number(line.slice(12)) : NaN;
          if (Number.isFinite(us) && o.probe.durationSec) o.onProgress?.(Math.min(0.999, Math.max(0, us / 1e6 / o.probe.durationSec)));
        }
      });
      child.on('error', reject);
      child.on('close', (code) => {
        o.signal?.removeEventListener('abort', onAbort);
        if (o.signal?.aborted) reject(new Error('canceled'));
        else if (code === 0) resolve();
        else reject(new Error(`FFmpeg failed: ${err.trim().split('\n').pop() ?? 'unknown error'}`));
      });
    });
    await rename(temp, o.output);
  } finally {
    await rm(temp, { force: true });
  }
}
