// Test media server for e2e runs. Serves the bundled samples from a second
// origin so cross-origin behaviour is exercised for real:
//   /cors/<file>?rate=<bytes/s>   CORS allowed, Range supported, optional throttle
//   /nocors/<file>                no CORS headers (browser blocks reads)
//   /page.html                    an HTML page, not media
//   anything else                 404
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLES = fileURLToPath(new URL('../../public/samples/', import.meta.url));
const TYPES = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };
const PORT = Number(process.env.MEDIA_PORT ?? 4599);

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const [, mode, file] = url.pathname.split('/');
  const cors = mode === 'cors';
  if (cors) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (url.pathname === '/page.html') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>page</title>');
  }
  if ((mode !== 'cors' && mode !== 'nocors') || !file || file.includes('..')) return res.writeHead(404).end('not found');

  const path = join(SAMPLES, file);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return res.writeHead(404).end('not found');
  }
  const type = TYPES[file.split('.').pop()] ?? 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  const start = range ? Number(range[1]) : 0;
  const end = range && range[2] ? Number(range[2]) : size - 1;
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();

  const rate = Number(url.searchParams.get('rate') ?? 0);
  const stream = createReadStream(path, { start, end, highWaterMark: rate ? Math.max(1024, Math.floor(rate / 10)) : 64 * 1024 });
  if (!rate) return stream.pipe(res);
  stream.on('data', (chunk) => {
    stream.pause();
    res.write(chunk);
    setTimeout(() => stream.resume(), 100);
  });
  stream.on('end', () => res.end());
  req.on('close', () => stream.destroy());
}).listen(PORT, () => console.log(`media server on ${PORT}`));
