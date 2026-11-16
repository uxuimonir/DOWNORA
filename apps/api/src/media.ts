/**
 * Media analysis and server jobs (download + optional FFmpeg conversion).
 * Every remote request goes through guardedFetch (SSRF-safe). Formats are
 * listed only when the source really has the streams and this server's
 * FFmpeg can produce them; resolutions never exceed the source.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import * as engine from '@downora/media-engine';
import { matchMime, matchUrl, namesFromPath, qualityLabelFor, sanitizeFileName, validateMediaUrl } from '@downora/source-adapters';
import type { Container, MediaAnalysis, MediaFormat, ServerJob, User } from '@downora/types';
import type { Config } from './config';
import type { Database } from './db';
import { guardedFetch } from './security/fetcher';
import { UnsafeUrlError } from './security/ssrf';

export class UserError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** FFprobe reads this much from the start (enough for files with metadata up front). */
const PROBE_BYTES = 2 * 1024 * 1024;
const PROBE_MS = 6000;
const ANALYSIS_TTL = 30 * 60_000;
const VIDEO_OUT: Container[] = ['mp4', 'webm', 'mkv'];
const AUDIO_OUT: Container[] = ['mp3', 'wav', 'm4a'];

interface Stored {
  analysis: MediaAnalysis;
  probe?: engine.ProbeResult;
  expires: number;
}

function userErrorFromFetch(e: unknown): UserError {
  if (e instanceof UnsafeUrlError) return new UserError(422, e.code, e.message);
  if (e instanceof UserError) return e;
  return new UserError(502, 'unreachable', 'Couldn’t reach that server. Check the link and try again.');
}

function checkStatus(status: number) {
  if (status === 401 || status === 403) throw new UserError(422, 'forbidden', `The site refused access (error ${status}). Downora never signs in on your behalf.`);
  if (status === 404 || status === 410) throw new UserError(422, 'not_found', 'Nothing was found at this link (error 404).');
  if (status >= 400) throw new UserError(422, 'http', `The server answered with error ${status}.`);
}

/** Streams a response to disk with a hard size cap and progress callback. */
async function saveBody(body: ReadableStream<Uint8Array> | null, path: string, cap: number, onBytes?: (n: number) => void, signal?: AbortSignal): Promise<number> {
  if (!body) throw new UserError(502, 'empty', 'The server sent an empty response.');
  let n = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      n += chunk.length;
      if (n > cap) return cb(new UserError(413, 'too_large', 'This file is larger than the server allows.'));
      onBytes?.(n);
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(body as never), counter, createWriteStream(path), { signal });
  return n;
}

export class Media {
  private analyses = new Map<string, Stored>();
  private jobs = new Map<string, ServerJob & { userId: string; dir: string; controller: AbortController }>();
  private queue: string[] = [];
  private running = 0;
  private timer: NodeJS.Timeout;

  constructor(
    private config: Config,
    private db: Database,
    public ffmpeg: engine.Engine | null,
  ) {
    this.timer = setInterval(() => void this.cleanup(), 60_000);
    this.timer.unref();
  }

  get jobsDir() {
    return join(this.config.dataDir, 'jobs');
  }

  /** Startup: nothing from a previous run is resumable, so delete it. */
  async init() {
    await rm(this.jobsDir, { recursive: true, force: true });
    await mkdir(this.jobsDir, { recursive: true });
  }

  close() {
    clearInterval(this.timer);
    for (const j of this.jobs.values()) j.controller.abort();
  }

  outputs(): Container[] {
    return this.ffmpeg ? engine.outputs(this.ffmpeg) : [];
  }

  // ───────────────────────── analysis ─────────────────────────

  async analyze(raw: string): Promise<MediaAnalysis> {
    const v = validateMediaUrl(raw);
    if (!v.ok) throw new UserError(400, 'invalid_url', v.message);
    let head;
    try {
      head = await guardedFetch(v.url.href, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
      if (head.response.status === 405 || head.response.status === 501) {
        head = await guardedFetch(v.url.href, { headers: { range: 'bytes=0-0' }, signal: AbortSignal.timeout(15_000) });
        await head.response.body?.cancel().catch(() => {});
      }
    } catch (e) {
      throw userErrorFromFetch(e);
    }
    const res = head.response;
    checkStatus(res.status);
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (mime === 'text/html' || mime === 'application/xhtml+xml') {
      throw new UserError(422, 'not_media', 'This link opens a web page, not a media file. Paste the direct link to the file.');
    }
    if (mime.includes('mpegurl') || mime === 'application/dash+xml') {
      throw new UserError(422, 'unsupported', 'Streaming playlists (HLS and DASH) aren’t supported.');
    }
    const match = matchMime(mime) ?? matchUrl(head.finalUrl);
    if (!match) throw new UserError(422, 'unsupported', 'Downora supports direct MP4, WebM, MP3, M4A and WAV files.');
    const range = res.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];
    const sizeBytes = res.status === 206 && range ? Number(range) : Number(res.headers.get('content-length')) || undefined;

    // Real metadata: FFprobe on the first part of the file.
    let probe: engine.ProbeResult | undefined;
    if (this.ffmpeg) {
      const tmp = join(this.jobsDir, `probe-${randomUUID()}`);
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), PROBE_MS);
        const r = await guardedFetch(head.finalUrl.href, { headers: { range: `bytes=0-${PROBE_BYTES - 1}` }, signal: ctl.signal });
        if (r.response.ok) {
          // Probe while it downloads and stop as soon as FFprobe can read it.
          let received = 0;
          let done = false;
          const saving = saveBody(r.response.body as never, tmp, PROBE_BYTES + 1024, (n) => (received = n), ctl.signal)
            .catch(() => {})
            .finally(() => (done = true));
          let tried = 0;
          while (!probe) {
            await new Promise((res) => setTimeout(res, 200));
            if (received > tried + 32 * 1024 || done) {
              tried = received;
              probe = await engine.probe(this.ffmpeg, tmp).catch(() => undefined);
            }
            if (done || ctl.signal.aborted) break;
          }
          ctl.abort();
          await saving;
          probe ??= await engine.probe(this.ffmpeg, tmp).catch(() => undefined);
        } else await r.response.body?.cancel().catch(() => {});
        clearTimeout(timer);
      } catch {
        /* metadata stays unknown */
      } finally {
        await rm(tmp, { force: true });
      }
    }

    const { title, baseName } = namesFromPath(head.finalUrl.pathname);
    const width = probe?.width;
    const height = probe?.height;
    const formats: MediaFormat[] = [
      {
        id: 'original',
        kind: match.kind,
        container: match.container,
        delivery: 'original',
        qualityLabel: width && height ? qualityLabelFor(width, height) : undefined,
        width,
        height,
        sizeBytes,
        mimeType: mime || undefined,
      },
    ];
    const outs = this.outputs();
    if (probe?.videoCodec && height && width) {
      const short = Math.min(width, height);
      for (const c of VIDEO_OUT.filter((c) => outs.includes(c))) {
        for (const h of engine.heightsFor(short)) {
          if (c === match.container && h === short) continue; // that's the original
          const w = Math.round((h * Math.max(width, height)) / short / 2) * 2;
          formats.push({ id: `${c}-${h}`, kind: 'video', container: c, delivery: 'transcode', qualityLabel: qualityLabelFor(w, h), width: w, height: h });
        }
      }
    }
    if (probe?.audioCodec) {
      for (const c of AUDIO_OUT.filter((c) => outs.includes(c) && c !== match.container)) {
        formats.push({ id: c, kind: 'audio', container: c, delivery: 'transcode' });
      }
    }

    const analysis: MediaAnalysis = {
      id: randomUUID(),
      sourceUrl: head.finalUrl.href,
      sourceHost: head.finalUrl.host,
      adapterId: match.adapterId,
      kind: match.kind,
      title,
      baseName,
      durationSec: probe?.durationSec,
      width,
      height,
      mimeType: mime || undefined,
      sizeBytes,
      playable: true,
      formats,
      access: { transfer: 'direct', ranges: res.headers.get('accept-ranges')?.includes('bytes') ?? null },
      analyzedAt: new Date().toISOString(),
    };
    this.analyses.set(analysis.id, { analysis, probe, expires: Date.now() + ANALYSIS_TTL });
    return analysis;
  }

  getAnalysis(id: string): MediaAnalysis | undefined {
    const s = this.analyses.get(id);
    return s && s.expires > Date.now() ? s.analysis : undefined;
  }

  // ───────────────────────── jobs ─────────────────────────

  private publicJob(j: ServerJob): ServerJob {
    const { userId: _u, dir: _d, controller: _c, ...rest } = j as ServerJob & { userId?: string; dir?: string; controller?: unknown };
    return rest;
  }

  listJobs(user: User): ServerJob[] {
    return [...this.jobs.values()].filter((j) => j.userId === user.id).map((j) => this.publicJob(j)).reverse();
  }

  getJob(user: User, id: string) {
    const j = this.jobs.get(id);
    return j && j.userId === user.id ? j : undefined;
  }

  createJob(user: User, mediaId: string, formatId: string): ServerJob {
    const stored = this.analyses.get(mediaId);
    if (!stored || stored.expires < Date.now()) throw new UserError(404, 'analysis_expired', 'Analyze the link again; the result expired.');
    const format = stored.analysis.formats.find((f) => f.id === formatId);
    if (!format) throw new UserError(422, 'bad_format', 'That format isn’t available for this file.');
    if (format.delivery === 'transcode' && !this.ffmpeg) throw new UserError(503, 'no_ffmpeg', 'Conversion isn’t available on this server.');
    if ([...this.jobs.values()].filter((j) => j.userId === user.id && ['queued', 'downloading', 'converting'].includes(j.status)).length >= 3) {
      throw new UserError(429, 'busy', 'You have 3 jobs running. Wait for one to finish.');
    }
    const id = randomUUID();
    const stem = sanitizeFileName(stored.analysis.title) || 'download';
    const suffix = format.delivery === 'transcode' && format.kind === 'video' && format.qualityLabel ? `-${format.qualityLabel}` : '';
    const job = {
      id,
      mediaId,
      formatId,
      title: stored.analysis.title,
      fileName: `${stem}${suffix}.${format.container}`,
      container: format.container,
      kind: format.kind,
      qualityLabel: format.qualityLabel,
      status: 'queued' as const,
      bytesReceived: 0,
      bytesTotal: stored.analysis.sizeBytes,
      createdAt: new Date().toISOString(),
      userId: user.id,
      dir: join(this.jobsDir, id),
      controller: new AbortController(),
    };
    this.jobs.set(id, job);
    this.queue.push(id);
    this.pump();
    return this.publicJob(job);
  }

  cancelJob(user: User, id: string): boolean {
    const j = this.getJob(user, id);
    if (!j) return false;
    j.controller.abort();
    this.queue = this.queue.filter((q) => q !== id);
    this.jobs.delete(id);
    void rm(j.dir, { recursive: true, force: true });
    return true;
  }

  filePath(user: User, id: string): { path: string; job: ServerJob } | undefined {
    const j = this.getJob(user, id);
    return j?.status === 'completed' ? { path: join(j.dir, 'out'), job: this.publicJob(j) } : undefined;
  }

  private pump() {
    while (this.running < this.config.concurrentJobs && this.queue.length) {
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job) continue;
      this.running += 1;
      void this.run(job).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  private async run(job: ServerJob & { userId: string; dir: string; controller: AbortController }) {
    const stored = this.analyses.get(job.mediaId)!;
    const format = stored.analysis.formats.find((f) => f.id === job.formatId)!;
    const signal = job.controller.signal;
    try {
      await mkdir(job.dir, { recursive: true });
      const fs = await statfs(this.config.dataDir);
      const free = fs.bavail * fs.bsize;
      if (stored.analysis.sizeBytes && free < stored.analysis.sizeBytes * 3 + 256 * 1024 * 1024) {
        throw new UserError(507, 'storage', 'The server is out of space right now. Try again later.');
      }

      job.status = 'downloading';
      let r;
      try {
        r = await guardedFetch(stored.analysis.sourceUrl, { signal });
      } catch (e) {
        throw userErrorFromFetch(e);
      }
      checkStatus(r.response.status);
      if ((r.response.headers.get('content-type') ?? '').startsWith('text/html')) throw new UserError(422, 'not_media', 'The link now opens a web page.');
      const len = Number(r.response.headers.get('content-length')) || undefined;
      if (len && len > this.config.maxFileBytes) throw new UserError(413, 'too_large', 'This file is larger than the server allows.');
      job.bytesTotal = len ?? job.bytesTotal;
      const src = join(job.dir, 'source');
      const got = await saveBody(r.response.body as never, src, this.config.maxFileBytes, (n) => (job.bytesReceived = n), signal);
      if (len && got !== len) throw new UserError(502, 'incomplete', 'The download was cut short.');

      const out = join(job.dir, 'out');
      if (format.delivery === 'original') {
        await import('node:fs/promises').then((f) => f.rename(src, out));
        if (this.ffmpeg) await engine.probe(this.ffmpeg, out).catch(() => {
          throw new UserError(422, 'not_media', 'The downloaded data isn’t a valid media file.');
        });
      } else {
        const ff = this.ffmpeg!;
        const probe = await engine.probe(ff, src).catch(() => {
          throw new UserError(422, 'not_media', 'The downloaded data isn’t a valid media file.');
        });
        job.status = 'converting';
        job.convertProgress = 0;
        await engine.convert(ff, {
          input: src,
          output: out,
          container: format.container,
          height: format.kind === 'video' ? format.height : undefined,
          preset: 'balanced',
          probe,
          signal,
          onProgress: (p) => (job.convertProgress = p),
        });
        await rm(src, { force: true });
        await engine.probe(ff, out); // the result must be readable media
        job.convertProgress = 1;
      }
      job.sizeBytes = (await stat(out)).size;
      job.status = 'completed';
      job.expiresAt = new Date(Date.now() + this.config.jobTtlMs).toISOString();
      this.db
        .prepare('INSERT INTO history (id, user_id, url, title, file_name, container, kind, quality_label, size_bytes, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), job.userId, stored.analysis.sourceUrl, job.title, job.fileName, job.container, job.kind, job.qualityLabel ?? null, job.sizeBytes, 'server', new Date().toISOString());
    } catch (e) {
      if (signal.aborted) return;
      job.status = 'failed';
      job.error = e instanceof UserError ? e.message : 'The job failed unexpectedly.';
      job.expiresAt = new Date(Date.now() + this.config.jobTtlMs).toISOString();
      await rm(job.dir, { recursive: true, force: true });
    }
  }

  /** Deletes expired files and analyses. */
  async cleanup() {
    const now = Date.now();
    for (const [id, a] of this.analyses) if (a.expires < now) this.analyses.delete(id);
    for (const [id, j] of this.jobs) {
      if (j.expiresAt && Date.parse(j.expiresAt) < now) {
        this.jobs.delete(id);
        await rm(j.dir, { recursive: true, force: true });
      }
    }
    // Anything on disk without a live job is a leftover.
    for (const name of await readdir(this.jobsDir).catch(() => [] as string[])) {
      if (!this.jobs.has(name) && !name.startsWith('probe-')) await rm(join(this.jobsDir, name), { recursive: true, force: true });
    }
  }
}
