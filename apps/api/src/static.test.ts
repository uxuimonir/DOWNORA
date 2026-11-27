import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from './app';

let app: App;
let base: string;
const web = mkdtempSync(join(tmpdir(), 'downora-web-'));

beforeAll(async () => {
  mkdirSync(join(web, 'assets'));
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>Downora</title>');
  writeFileSync(join(web, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(web, 'clip.mp4'), Buffer.alloc(1000, 7));
  writeFileSync(join(tmpdir(), 'downora-secret.txt'), 'secret');
  app = await createApp({ dataDir: mkdtempSync(join(tmpdir(), 'downora-data-')), webDir: web });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});
afterAll(() => app.close());

describe('one-server deploy: the API also serves the web app', () => {
  it('serves index.html at / and for client routes', async () => {
    for (const p of ['/', '/dashboard', '/video']) {
      const r = await fetch(base + p);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toContain('text/html');
      expect(await r.text()).toContain('<title>Downora</title>');
    }
  });

  it('serves built assets with long caching', async () => {
    const r = await fetch(`${base}/assets/app.js`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('immutable');
  });

  it('supports byte ranges for media', async () => {
    const r = await fetch(`${base}/clip.mp4`, { headers: { range: 'bytes=100-199' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect((await r.arrayBuffer()).byteLength).toBe(100);
  });

  it('never leaves the web folder', async () => {
    for (const p of ['/..%2fdownora-secret.txt', '/%2e%2e/%2e%2e/etc/passwd', '/assets/..%2f..%2fdownora-secret.txt']) {
      const r = await fetch(base + p);
      const body = await r.text();
      expect(body).not.toContain('secret');
      expect(body).not.toContain('root:');
      // Either refused, or normalised by the URL parser into an in-folder route (the app page).
      if (r.status === 200) expect(body).toContain('<title>Downora</title>');
      else expect(r.status).toBe(404);
    }
  });

  it('keeps API routes and API 404s as JSON', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    const r = await fetch(`${base}/api/nope`);
    expect(r.status).toBe(404);
    expect(r.headers.get('content-type')).toContain('application/json');
  });
});
