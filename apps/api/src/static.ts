/**
 * Serves the built web app (one-server deploy). Only files inside `root` are
 * reachable; unknown paths get index.html so client routes work.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

async function fileAt(root: string, pathname: string) {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  const full = resolve(join(root, rel));
  if (full !== root && !full.startsWith(root + sep)) return null; // path traversal
  const s = await stat(full).catch(() => null);
  return s?.isFile() ? { full, size: s.size } : null;
}

/** Returns true when it handled the request. */
export async function serveStatic(rootDir: string, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const root = resolve(rootDir);
  // Anything that tries to climb out of the folder is simply not found.
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.split(/[\\/]/).includes('..')) return false;
  let f = await fileAt(root, pathname);
  let spa = false;
  if (!f && !extname(pathname)) {
    f = await fileAt(root, '/index.html');
    spa = true;
  }
  if (!f) return false;
  const type = TYPES[extname(f.full).toLowerCase()] ?? 'application/octet-stream';
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Cache-Control': pathname.startsWith('/assets/') && !spa ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Frame-Options': 'DENY',
  };

  // Byte ranges, so sample media can seek and resume like on any file host.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && !spa && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : f.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : f.size - 1;
    start = Math.max(0, start);
    end = Math.min(f.size - 1, end);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${f.size}` }).end();
      return true;
    }
    res.writeHead(206, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${f.size}`, 'Content-Length': String(end - start + 1) });
    if (req.method === 'HEAD') res.end();
    else createReadStream(f.full, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': String(f.size) });
  if (req.method === 'HEAD') res.end();
  else createReadStream(f.full).pipe(res);
  return true;
}
