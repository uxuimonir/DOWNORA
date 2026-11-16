/* eslint-disable @typescript-eslint/no-explicit-any -- test responses are checked by assertions */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MediaAnalysis, ServerJob } from '@downora/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from './app';

const SAMPLES = fileURLToPath(new URL('../../web/public/samples/', import.meta.url));
const WEB = 'http://localhost:5173';
let app: App;
let api: string;
let media: Server;
let mediaBase: string;

beforeAll(async () => {
  // Media fixture server on 127.0.0.1 (allow-listed for tests only).
  media = createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    if (url.pathname === '/page') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html>');
    if (url.pathname === '/to-metadata') return res.writeHead(302, { location: 'http://169.254.169.254/latest/x.mp4' }).end();
    if (url.pathname === '/to-sample') return res.writeHead(301, { location: '/media/downora-sample-tone.mp3' }).end();
    const file = url.pathname.replace('/media/', '');
    let body: Buffer;
    try {
      body = readFileSync(join(SAMPLES, file));
    } catch {
      return res.writeHead(404).end();
    }
    const type = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' }[file.split('.').pop()!]!;
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    if (range) {
      const s = Number(range[1]);
      const e = Math.min(range[2] ? Number(range[2]) : body.length - 1, body.length - 1);
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${s}-${e}/${body.length}`, 'content-length': e - s + 1, 'accept-ranges': 'bytes' });
      return res.end(req.method === 'HEAD' ? undefined : body.subarray(s, e + 1));
    }
    res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'accept-ranges': 'bytes' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  await new Promise<void>((r) => media.listen(0, '127.0.0.1', r));
  mediaBase = `http://127.0.0.1:${(media.address() as { port: number }).port}`;

  app = await createApp({ dataDir: mkdtempSync(join(tmpdir(), 'downora-api-')), allowPrivateHosts: ['127.0.0.1'], corsOrigins: new Set([WEB]), rateLimitPerMinute: 10_000, concurrentJobs: 2 });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  api = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await app.close();
  media.close();
});

const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: WEB, ...extra },
  body: JSON.stringify(body),
});

async function account(email = `u${Math.random().toString(36).slice(2)}@example.com`) {
  const r = await fetch(`${api}/api/auth/register`, json({ email, password: 'correct horse battery' }));
  expect(r.status).toBe(201);
  const cookie = r.headers.get('set-cookie')!.split(';')[0]!;
  return { email, cookie, headers: { cookie, origin: WEB } };
}

async function analyze(url: string): Promise<{ status: number; body: MediaAnalysis & { error?: { code: string; message: string } } }> {
  const r = await fetch(`${api}/api/media/analyze`, json({ url }));
  return { status: r.status, body: await r.json() as any };
}

async function waitJob(id: string, headers: Record<string, string>): Promise<ServerJob> {
  for (let i = 0; i < 300; i += 1) {
    const j = (await (await fetch(`${api}/api/downloads/${id}`, { headers })).json() as any) as ServerJob;
    if (j.status === 'completed' || j.status === 'failed') return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('job timeout');
}

describe('health', () => {
  it('reports real capabilities', async () => {
    const h = await (await fetch(`${api}/api/health`)).json() as any;
    expect(h.capabilities).toMatchObject({ analyze: true, auth: true, transcode: true, history: true });
    expect(h.outputs).toEqual(expect.arrayContaining(['mp4', 'mp3', 'wav', 'm4a']));
  });
});

describe('accounts', () => {
  it('registers with an HttpOnly cookie and validates input', async () => {
    const r = await fetch(`${api}/api/auth/register`, json({ email: 'a@example.com', password: 'correct horse battery' }));
    expect(r.status).toBe(201);
    const c = r.headers.get('set-cookie')!;
    expect(c).toMatch(/dn_session=[\w-]{20,}; HttpOnly; SameSite=Lax; Path=\//);
    expect((await r.json() as any).token).toBeUndefined();
    expect((await fetch(`${api}/api/auth/register`, json({ email: 'A@example.com', password: 'correct horse battery' }))).status).toBe(409);
    expect((await fetch(`${api}/api/auth/register`, json({ email: 'nope', password: 'correct horse battery' }))).status).toBe(422);
    expect((await fetch(`${api}/api/auth/register`, json({ email: 'b@example.com', password: 'short' }))).status).toBe(422);
    expect((await fetch(`${api}/api/auth/register`, json({ email: 'c@example.com', password: 'correct horse battery' }, { origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('signs in, reads /me, signs out', async () => {
    const { email, cookie } = await account();
    const login = await fetch(`${api}/api/auth/login`, json({ email, password: 'correct horse battery' }));
    expect(login.status).toBe(200);
    const fresh = login.headers.get('set-cookie')!.split(';')[0]!;
    expect((await (await fetch(`${api}/api/auth/me`, { headers: { cookie: fresh } })).json() as any).user.email).toBe(email);
    await fetch(`${api}/api/auth/logout`, { method: 'POST', headers: { cookie: fresh, origin: WEB } });
    expect((await (await fetch(`${api}/api/auth/me`, { headers: { cookie: fresh } })).json() as any).user).toBeNull();
    expect((await (await fetch(`${api}/api/auth/me`, { headers: { cookie } })).json() as any).user).not.toBeNull(); // other sessions survive
  });

  it('gives the extension a bearer token instead of a cookie', async () => {
    const { email } = await account();
    const r = await fetch(`${api}/api/auth/login`, json({ email, password: 'correct horse battery', client: 'extension' }, { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' }));
    const body = await r.json() as any;
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(body.token).toMatch(/^[\w-]{40,}$/);
    expect((await fetch(`${api}/api/auth/me`, { headers: { authorization: `Bearer ${body.token}` } })).status).toBe(200);
  });

  it('rate limits wrong passwords', async () => {
    const { email } = await account();
    for (let i = 0; i < 5; i += 1) expect((await fetch(`${api}/api/auth/login`, json({ email, password: 'wrong password!!' }))).status).toBe(401);
    expect((await fetch(`${api}/api/auth/login`, json({ email, password: 'correct horse battery' }))).status).toBe(429);
  });
});

describe('analysis', () => {
  it('lists real formats: original plus conversions, never above the source', async () => {
    const { status, body } = await analyze(`${mediaBase}/media/downora-sample-1080p.mp4`);
    expect(status).toBe(200);
    expect(body.width).toBe(1920);
    expect(body.height).toBe(1080);
    expect(Math.round(body.durationSec!)).toBe(8);
    const ids = body.formats.map((f) => f.id);
    expect(ids[0]).toBe('original');
    expect(body.formats[0]).toMatchObject({ container: 'mp4', qualityLabel: '1080p', delivery: 'original', sizeBytes: statSync(join(SAMPLES, 'downora-sample-1080p.mp4')).size });
    expect(ids).toEqual(expect.arrayContaining(['mp4-720', 'mp4-480', 'webm-1080', 'mkv-1080', 'mp3', 'wav', 'm4a']));
    expect(ids).not.toContain('mp4-1080'); // same as the original
    expect(body.formats.some((f) => (f.height ?? 0) > 1080)).toBe(false); // no 2K/4K/8K
  });

  it('offers only audio formats for an audio file', async () => {
    const { body } = await analyze(`${mediaBase}/media/downora-sample-tone.mp3`);
    expect(body.formats.every((f) => f.kind === 'audio')).toBe(true);
    expect(body.formats.map((f) => f.container)).toEqual(expect.arrayContaining(['mp3', 'wav', 'm4a']));
  });

  it('follows safe redirects and explains failures', async () => {
    expect((await analyze(`${mediaBase}/to-sample`)).body.formats[0]!.container).toBe('mp3');
    expect((await analyze(`${mediaBase}/page`)).body.error!.code).toBe('not_media');
    expect((await analyze(`${mediaBase}/media/missing.mp4`)).body.error!.code).toBe('not_found');
    expect((await analyze('ftp://x/a.mp4')).status).toBe(400);
  });

  it('blocks SSRF: private addresses, redirects into them, localhost', async () => {
    for (const url of ['http://10.0.0.5/a.mp4', 'http://169.254.169.254/latest/meta-data', 'http://localhost:8787/api/health', 'http://[::1]/a.mp4', `${mediaBase}/to-metadata`]) {
      const r = await analyze(url);
      expect([400, 422], url).toContain(r.status);
      expect(r.body.error!.code, url).toMatch(/private_address|invalid_url|bad_port/);
    }
  });
});

describe('server jobs', () => {
  it('requires an account and a same-origin request', async () => {
    const { body } = await analyze(`${mediaBase}/media/downora-sample-tone.wav`);
    expect((await fetch(`${api}/api/downloads`, json({ mediaId: body.id, formatId: 'mp3' }))).status).toBe(401);
    const { cookie } = await account();
    expect((await fetch(`${api}/api/downloads`, json({ mediaId: body.id, formatId: 'mp3' }, { cookie, origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('converts video to MP3 and serves a real file, logged to history', async () => {
    const u = await account();
    const { body } = await analyze(`${mediaBase}/media/downora-sample-1080p.mp4`);
    const created = await fetch(`${api}/api/downloads`, json({ mediaId: body.id, formatId: 'mp3' }, u.headers));
    expect(created.status).toBe(201);
    const job = await waitJob((await created.json() as any).id, u.headers);
    expect(job).toMatchObject({ status: 'completed', container: 'mp3', fileName: 'downora sample 1080p.mp3' });
    const file = await fetch(`${api}/api/downloads/${job.id}/file`, { headers: u.headers });
    expect(file.headers.get('content-disposition')).toContain('attachment; filename="downora sample 1080p.mp3"');
    const out = join(mkdtempSync(join(tmpdir(), 'dl-')), 'out.mp3');
    writeFileSync(out, Buffer.from(await file.arrayBuffer()));
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', out]).toString());
    expect(probe.streams.map((s: { codec_type: string }) => s.codec_type)).toEqual(['audio']);
    expect(Math.round(Number(probe.format.duration))).toBe(8);

    const history = (await (await fetch(`${api}/api/history`, { headers: u.headers })).json() as any).items;
    expect(history[0]).toMatchObject({ source: 'server', fileName: 'downora sample 1080p.mp3' });
  });

  it('scales video down, never up, and other users can’t see the job', async () => {
    const u = await account();
    const other = await account();
    const { body } = await analyze(`${mediaBase}/media/downora-sample-1080p.mp4`);
    const j = await (await fetch(`${api}/api/downloads`, json({ mediaId: body.id, formatId: 'webm-720' }, u.headers))).json() as any;
    expect((await fetch(`${api}/api/downloads/${j.id}`, { headers: other.headers })).status).toBe(404);
    expect((await fetch(`${api}/api/downloads/${j.id}/file`, { headers: other.headers })).status).toBe(404);
    const done = await waitJob(j.id, u.headers);
    expect(done.status).toBe('completed');
    const out = join(mkdtempSync(join(tmpdir(), 'dl-')), 'o.webm');
    writeFileSync(out, Buffer.from(await (await fetch(`${api}/api/downloads/${j.id}/file`, { headers: u.headers })).arrayBuffer()));
    const s = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', out]).toString()).streams.find((x: { codec_type: string }) => x.codec_type === 'video');
    expect([s.codec_name, s.width, s.height]).toEqual(['vp9', 1280, 720]);
    expect((await fetch(`${api}/api/downloads`, json({ mediaId: body.id, formatId: 'mp4-2160' }, u.headers))).status).toBe(422);
  });

  it('serves the original file byte for byte, and cancels', async () => {
    const u = await account();
    const { body } = await analyze(`${mediaBase}/media/downora-sample-720p.webm`);
    const j = await (await fetch(`${api}/api/downloads`, json({ mediaId: body.id, formatId: 'original' }, u.headers))).json() as any;
    const done = await waitJob(j.id, u.headers);
    const bytes = Buffer.from(await (await fetch(`${api}/api/downloads/${done.id}/file`, { headers: u.headers })).arrayBuffer());
    expect(bytes.equals(readFileSync(join(SAMPLES, 'downora-sample-720p.webm')))).toBe(true);
    expect((await fetch(`${api}/api/downloads/${done.id}`, { method: 'DELETE', headers: u.headers })).status).toBe(200);
    expect((await fetch(`${api}/api/downloads/${done.id}/file`, { headers: u.headers })).status).toBe(404);
  });
});

describe('history & settings', () => {
  it('stores validated history entries per user', async () => {
    const u = await account();
    const ok = await fetch(`${api}/api/history`, json({ url: 'https://cdn.example/a.mp4', title: 'A', fileName: 'A.mp4', container: 'mp4', kind: 'video', qualityLabel: '1080p', sizeBytes: 123, source: 'extension' }, u.headers));
    expect(ok.status).toBe(201);
    for (const bad of [{ url: 'javascript:x', title: 'A', fileName: 'A', container: 'mp4', kind: 'video' }, { url: 'https://x/a', title: 'A', fileName: 'A', container: 'exe', kind: 'video' }]) {
      expect((await fetch(`${api}/api/history`, json(bad, u.headers))).status).toBe(422);
    }
    const other = await account();
    expect((await (await fetch(`${api}/api/history`, { headers: other.headers })).json() as any).items).toEqual([]);
    const mine = (await (await fetch(`${api}/api/history`, { headers: u.headers })).json() as any).items;
    expect(mine).toHaveLength(1);
    await fetch(`${api}/api/history/${mine[0].id}`, { method: 'DELETE', headers: u.headers });
    expect((await (await fetch(`${api}/api/history`, { headers: u.headers })).json() as any).items).toEqual([]);
  });

  it('saves user settings', async () => {
    const u = await account();
    const put = await fetch(`${api}/api/user/settings`, { ...json({ theme: 'light' }, u.headers), method: 'PUT' });
    expect(put.status).toBe(200);
    expect(await (await fetch(`${api}/api/user/settings`, { headers: u.headers })).json() as any).toEqual({ theme: 'light' });
  });
});
