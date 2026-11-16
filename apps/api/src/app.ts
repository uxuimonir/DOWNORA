/**
 * Downora API. No framework: a small router over node:http.
 *
 * Auth: cookie (web app, HttpOnly, SameSite=Lax) or `Authorization: Bearer`
 * (extension). State-changing cookie requests must come from an allowed
 * Origin with a JSON body (CSRF). Every remote fetch is SSRF-guarded.
 */
import { createReadStream } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import * as engine from '@downora/media-engine';
import { describeAdapters } from '@downora/source-adapters';
import { CONTAINERS, type ApiError, type HealthResponse, type HistoryEntry, type User } from '@downora/types';
import { Attempts, checkLogin, COOKIE, createSession, createUser, deleteSession, pruneSessions, SESSION_DAYS, userForToken, validateCredentials } from './auth';
import { loadConfig, type Config } from './config';
import { openDb, type Database } from './db';
import { Media, UserError } from './media';
import { allowPrivateHosts } from './security/ssrf';

const VERSION = '0.2.0';

type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  ip: string;
};
type Handler = (c: Ctx) => Promise<void> | void;

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function fail(res: ServerResponse, status: number, code: string, message: string) {
  send(res, status, { error: { code, message } } satisfies ApiError);
}

async function readJson(req: IncomingMessage, limit = 16 * 1024): Promise<Record<string, unknown>> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new UserError(415, 'json_required', 'Send JSON.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new UserError(413, 'too_large', 'Request body too large.');
    chunks.push(c as Buffer);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new UserError(400, 'bad_json', 'Malformed JSON.');
  }
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export interface App {
  server: Server;
  db: Database;
  media: Media;
  config: Config;
  close: () => Promise<void>;
}

export async function createApp(overrides: Partial<Config> = {}): Promise<App> {
  const config = { ...loadConfig(), ...overrides };
  allowPrivateHosts(config.allowPrivateHosts);
  const db = openDb(config.dataDir);
  const media = new Media(config, db, await engine.discover());
  await media.init();
  const loginByIp = new Attempts(20, 15 * 60_000);
  const loginByEmail = new Attempts(5, 15 * 60_000);
  const hits = new Map<string, { n: number; until: number }>();

  const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler; auth?: boolean }[] = [];
  const route = (method: string, path: string, handler: Handler) => {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([\\w-]+)'))}$`);
    routes.push({ method, pattern, keys, handler });
  };

  /** The signed-in user (cookie or bearer token), enforcing CSRF rules for cookies. */
  const session = (c: Ctx): { user: User | null; token?: string; viaCookie: boolean } => {
    const bearer = c.req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (bearer) return { user: userForToken(db, bearer), token: bearer, viaCookie: false };
    const t = cookie(c.req, COOKIE);
    return { user: userForToken(db, t), token: t, viaCookie: true };
  };
  const requireUser = (c: Ctx): User => {
    const s = session(c);
    if (!s.user) throw new UserError(401, 'unauthorized', 'Sign in to use this.');
    if (s.viaCookie && c.req.method !== 'GET' && !config.corsOrigins.has(c.req.headers.origin ?? '')) {
      throw new UserError(403, 'bad_origin', 'Request blocked: unknown origin.');
    }
    return s.user;
  };
  const setCookie = (token: string) =>
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${config.secureCookies ? '; Secure' : ''}`;

  // ── health & sources ──
  route('GET', '/api/health', ({ res }) =>
    send(res, 200, {
      status: 'ok',
      service: 'downora-api',
      version: VERSION,
      capabilities: { analyze: true, downloads: true, transcode: Boolean(media.ffmpeg), auth: true, history: true },
      outputs: media.outputs(),
    } satisfies HealthResponse),
  );
  route('GET', '/api/sources', ({ res }) => send(res, 200, { sources: describeAdapters() }));

  // ── accounts ──
  const signIn = async (c: Ctx, mode: 'register' | 'login') => {
    if (!config.corsOrigins.has(c.req.headers.origin ?? '') && !(c.req.headers.origin ?? '').startsWith('chrome-extension://')) {
      throw new UserError(403, 'bad_origin', 'Request blocked: unknown origin.');
    }
    const body = await readJson(c.req);
    const err = validateCredentials(body.email, body.password);
    if (err && mode === 'register') throw new UserError(422, 'invalid', err);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const client = body.client === 'extension' ? 'extension' : 'web';
    if (loginByIp.blocked(c.ip) || loginByEmail.blocked(email)) throw new UserError(429, 'too_many', 'Too many attempts. Try again in 15 minutes.');
    let user: User | null;
    if (mode === 'register') {
      const r = await createUser(db, email, password);
      if (r === 'exists') throw new UserError(409, 'exists', 'An account with this email already exists. Sign in instead.');
      user = r;
    } else {
      user = err ? null : await checkLogin(db, email, password);
      if (!user) {
        loginByIp.fail(c.ip);
        loginByEmail.fail(email);
        throw new UserError(401, 'bad_credentials', 'That email and password don’t match.');
      }
      loginByEmail.clear(email);
    }
    const token = createSession(db, user.id, client);
    if (client === 'extension') send(c.res, mode === 'register' ? 201 : 200, { user, token });
    else send(c.res, mode === 'register' ? 201 : 200, { user }, { 'Set-Cookie': setCookie(token) });
  };
  route('POST', '/api/auth/register', (c) => signIn(c, 'register'));
  route('POST', '/api/auth/login', (c) => signIn(c, 'login'));
  route('POST', '/api/auth/logout', (c) => {
    const s = session(c);
    if (s.viaCookie && s.user && !config.corsOrigins.has(c.req.headers.origin ?? '')) throw new UserError(403, 'bad_origin', 'Request blocked.');
    deleteSession(db, s.token);
    send(c.res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
  });
  // Signed-out is a normal state, not an error: answer 200 with user: null.
  route('GET', '/api/auth/me', (c) => send(c.res, 200, { user: session(c).user }));

  // ── media ──
  route('POST', '/api/media/analyze', async (c) => {
    const body = await readJson(c.req);
    if (typeof body.url !== 'string' || body.url.length > 4096) throw new UserError(400, 'invalid_url', 'Send a link to analyze.');
    send(c.res, 200, await media.analyze(body.url));
  });
  route('GET', '/api/media/:id/formats', (c) => {
    const a = media.getAnalysis(c.params.id!);
    if (!a) throw new UserError(404, 'not_found', 'Analyze the link again; the result expired.');
    send(c.res, 200, { mediaId: a.id, formats: a.formats });
  });

  // ── server jobs ──
  route('POST', '/api/downloads', async (c) => {
    const user = requireUser(c);
    const body = await readJson(c.req);
    if (typeof body.mediaId !== 'string' || typeof body.formatId !== 'string') throw new UserError(400, 'bad_request', 'Send mediaId and formatId.');
    send(c.res, 201, media.createJob(user, body.mediaId, body.formatId));
  });
  route('GET', '/api/downloads', (c) => send(c.res, 200, { items: media.listJobs(requireUser(c)) }));
  route('GET', '/api/downloads/:id', (c) => {
    const j = media.getJob(requireUser(c), c.params.id!);
    if (!j) throw new UserError(404, 'not_found', 'No such job.');
    send(c.res, 200, media.listJobs(requireUser(c)).find((x) => x.id === j.id));
  });
  route('GET', '/api/downloads/:id/file', (c) => {
    const f = media.filePath(requireUser(c), c.params.id!);
    if (!f) throw new UserError(404, 'not_ready', 'The file isn’t ready, or it expired.');
    const ascii = f.job.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
    c.res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(f.job.sizeBytes ?? ''),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.job.fileName)}`,
      'Cache-Control': 'no-store',
    });
    createReadStream(f.path).pipe(c.res);
  });
  route('DELETE', '/api/downloads/:id', (c) => {
    if (!media.cancelJob(requireUser(c), c.params.id!)) throw new UserError(404, 'not_found', 'No such job.');
    send(c.res, 200, { ok: true });
  });

  // ── history ──
  const historyRow = (r: Record<string, unknown>): HistoryEntry => ({
    id: String(r.id),
    url: String(r.url),
    title: String(r.title),
    fileName: String(r.file_name),
    container: r.container as HistoryEntry['container'],
    kind: r.kind as HistoryEntry['kind'],
    qualityLabel: (r.quality_label as string | null) ?? undefined,
    sizeBytes: (r.size_bytes as number | null) ?? undefined,
    source: r.source as HistoryEntry['source'],
    createdAt: String(r.created_at),
  });
  route('GET', '/api/history', (c) => {
    const user = requireUser(c);
    const rows = db.prepare('SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT 500').all(user.id) as Record<string, unknown>[];
    send(c.res, 200, { items: rows.map(historyRow) });
  });
  route('POST', '/api/history', async (c) => {
    const user = requireUser(c);
    const b = await readJson(c.req);
    const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
    const url = str(b.url, 4096);
    const title = str(b.title, 300);
    const fileName = str(b.fileName, 300);
    const container = CONTAINERS.includes(b.container as never) ? (b.container as string) : null;
    const kind = b.kind === 'video' || b.kind === 'audio' ? b.kind : null;
    const source = b.source === 'extension' ? 'extension' : 'web';
    if (!url || !/^https?:\/\//.test(url) || !title || !fileName || !container || !kind) throw new UserError(422, 'invalid', 'Incomplete history entry.');
    const entry: HistoryEntry = {
      id: randomUUID(),
      url,
      title,
      fileName,
      container: container as HistoryEntry['container'],
      kind,
      qualityLabel: str(b.qualityLabel, 12) ?? undefined,
      sizeBytes: typeof b.sizeBytes === 'number' && b.sizeBytes >= 0 && b.sizeBytes < 1e13 ? Math.round(b.sizeBytes) : undefined,
      source,
      createdAt: new Date().toISOString(),
    };
    db.prepare('INSERT INTO history (id, user_id, url, title, file_name, container, kind, quality_label, size_bytes, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      entry.id, user.id, entry.url, entry.title, entry.fileName, entry.container, entry.kind, entry.qualityLabel ?? null, entry.sizeBytes ?? null, entry.source, entry.createdAt,
    );
    send(c.res, 201, entry);
  });
  route('DELETE', '/api/history/:id', (c) => {
    db.prepare('DELETE FROM history WHERE id = ? AND user_id = ?').run(c.params.id!, requireUser(c).id);
    send(c.res, 200, { ok: true });
  });
  route('DELETE', '/api/history', (c) => {
    db.prepare('DELETE FROM history WHERE user_id = ?').run(requireUser(c).id);
    send(c.res, 200, { ok: true });
  });

  // ── user settings (opaque JSON, small) ──
  route('GET', '/api/user/settings', (c) => {
    const r = db.prepare('SELECT settings FROM users WHERE id = ?').get(requireUser(c).id) as { settings: string | null } | undefined;
    send(c.res, 200, r?.settings ? JSON.parse(r.settings) : {});
  });
  route('PUT', '/api/user/settings', async (c) => {
    const user = requireUser(c);
    const body = await readJson(c.req, 4096);
    db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(body), user.id);
    send(c.res, 200, body);
  });

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.on('finish', () => process.env.NODE_ENV !== 'test' && console.log(`${req.method} ${req.url?.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`));
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();

    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || h.until < now) hits.set(ip, { n: 1, until: now + 60_000 });
    else if (++h.n > config.rateLimitPerMinute) return fail(res, 429, 'rate_limited', 'Too many requests. Try again in a minute.');

    const url = new URL(req.url ?? '/', 'http://api');
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.pattern);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]!]));
      try {
        await r.handler({ req, res, url, params, ip });
      } catch (e) {
        if (e instanceof UserError) fail(res, e.status, e.code, e.message);
        else {
          console.error(e);
          if (!res.headersSent) fail(res, 500, 'internal', 'Something went wrong on the server.');
        }
      }
      return;
    }
    fail(res, 404, 'not_found', 'No such endpoint.');
  };

  const server = createServer((req, res) => void handle(req, res));
  const prune = setInterval(() => pruneSessions(db), 3_600_000);
  prune.unref();
  return {
    server,
    db,
    media,
    config,
    close: async () => {
      clearInterval(prune);
      media.close();
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
    },
  };
}
