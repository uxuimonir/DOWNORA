/**
 * Downora API — Phase 3 groundwork.
 *
 * Implemented: health, the source registry, CORS, per-IP rate limiting,
 * JSON errors and request logging. Every other contract route answers 501
 * with an explicit message, so clients never mistake it for a working feature.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describeAdapters } from '@downora/source-adapters';
import type { ApiError, HealthResponse, SourcesResponse } from '@downora/types';

const PORT = Number(process.env.PORT ?? 8787);
const ORIGINS = new Set((process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean));
const RATE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60);
const VERSION = '0.1.0';

const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of hits) if (e.resetAt < now) hits.delete(ip);
}, 60_000).unref();

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function fail(res: ServerResponse, status: number, code: string, message: string) {
  send(res, status, { error: { code, message } } satisfies ApiError);
}

const PLANNED: [string, RegExp][] = [
  ['POST', /^\/api\/media\/analyze$/],
  ['GET', /^\/api\/media\/[\w-]+\/formats$/],
  ['POST', /^\/api\/downloads$/],
  ['GET', /^\/api\/downloads(\/[\w-]+)?$/],
  ['DELETE', /^\/api\/downloads\/[\w-]+$/],
  ['GET', /^\/api\/user\/settings$/],
];

export function handle(req: IncomingMessage, res: ServerResponse) {
  const started = Date.now();
  const origin = req.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.on('finish', () => console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`));

  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (rateLimited(ip)) return fail(res, 429, 'rate_limited', 'Too many requests. Try again in a minute.');

  const path = new URL(req.url ?? '/', 'http://api').pathname;

  if (req.method === 'GET' && path === '/api/health') {
    return send(res, 200, {
      status: 'ok',
      service: 'downora-api',
      version: VERSION,
      capabilities: { analyze: false, downloads: false, transcode: false, auth: false },
    } satisfies HealthResponse);
  }
  if (req.method === 'GET' && path === '/api/sources') {
    return send(res, 200, { sources: describeAdapters() } satisfies SourcesResponse);
  }
  if (PLANNED.some(([m, re]) => m === req.method && re.test(path))) {
    return fail(res, 501, 'not_implemented', 'This endpoint is part of Phase 3 and is not implemented yet.');
  }
  return fail(res, 404, 'not_found', 'No such endpoint.');
}

if (process.env.NODE_ENV !== 'test') {
  createServer(handle).listen(PORT, () => console.log(`Downora API listening on http://localhost:${PORT}`));
}
