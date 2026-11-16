// Fixture server for the extension e2e suite (port 4600).
//   /pages/<file>            test pages
//   /media/<file>?rate=N     sample media, Range support, optional throttle (bytes/s)
//   /forbidden/<file>        403 for everything
//   /broken/<file>           sends half the file, then drops the connection
//   /badapi/api/health       500, for API error states
//   /dash/*                  stand-in for the Downora web app
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = fileURLToPath(new URL('./pages/', import.meta.url));
const SAMPLES = fileURLToPath(new URL('../../../web/public/samples/', import.meta.url));
const TYPES = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', html: 'text/html; charset=utf-8', jpg: 'image/jpeg' };
const PORT = Number(process.env.FIXTURE_PORT ?? 4600);

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const [, area, file] = url.pathname.split('/');
  if (file?.includes('..')) return res.writeHead(400).end();
  if (area === 'badapi') return res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"error":{"code":"boom"}}');
  if (area === 'dash') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Downora web app (stand-in)</title><h1>Dashboard</h1>');
  if (area === 'forbidden') return res.writeHead(403, { 'Content-Type': 'text/plain' }).end('forbidden');
  if (area === 'pages' && file) {
    try {
      const body = readFileSync(join(PAGES, file));
      return res.writeHead(200, { 'Content-Type': TYPES[file.split('.').pop()] ?? 'application/octet-stream' }).end(body);
    } catch {
      return res.writeHead(404).end('not found');
    }
  }
  if ((area === 'media' || area === 'broken') && file) {
    const path = join(SAMPLES, file);
    let size;
    try {
      size = statSync(path).size;
    } catch {
      return res.writeHead(404).end('not found');
    }
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Number(range[2]) : size - 1;
    const headers = { 'Content-Type': TYPES[file.split('.').pop()], 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') return res.end();
    if (area === 'broken') {
      const s = createReadStream(path, { start: 0, end: Math.floor(size / 2) });
      s.on('data', (c) => res.write(c));
      s.on('end', () => setTimeout(() => res.destroy(), 200));
      return;
    }
    const rate = Number(url.searchParams.get('rate') ?? 0);
    const stream = createReadStream(path, { start, end, highWaterMark: rate ? Math.max(1024, Math.floor(rate / 10)) : 65536 });
    if (!rate) return stream.pipe(res);
    stream.on('data', (chunk) => {
      stream.pause();
      res.write(chunk);
      setTimeout(() => stream.resume(), 100);
    });
    stream.on('end', () => res.end());
    req.on('close', () => stream.destroy());
    return;
  }
  res.writeHead(404).end('not found');
}).listen(PORT, () => console.log(`extension fixtures on ${PORT}`));
