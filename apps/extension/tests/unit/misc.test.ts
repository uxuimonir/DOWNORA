import { describe, expect, it, vi } from 'vitest';
import { probe } from '../../src/background/probe';
import { formatBytes, qualityOf } from '../../src/content/overlay';
import { checkApi } from '../../src/shared/api';
import { downloadFileName } from '../../src/shared/filename';
import { dashboardLink, normalizeSettings } from '../../src/shared/settings';

const res = (status: number, headers: Record<string, string> = {}) => new Response(status === 204 || status === 206 ? null : '', { status, headers });
const fetchOf = (...responses: (Response | Error)[]) => {
  const f = vi.fn(async () => {
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  });
  return f as unknown as typeof fetch;
};

describe('downloadFileName', () => {
  it('produces safe names', () => {
    expect(downloadFileName('My clip: part 1/2', 'mp4')).toBe('My clip part 1 2.mp4');
    expect(downloadFileName('../../etc/passwd', 'mp3')).toBe('etc passwd.mp3');
    expect(downloadFileName('CON', 'wav')).toBe('downora-CON.wav');
    expect(downloadFileName('   ', 'webm')).toBe('downora-media.webm');
    expect(downloadFileName('x'.repeat(400), 'mp4').length).toBeLessThanOrEqual(104);
  });
});

describe('settings', () => {
  it('falls back on bad values and rejects non-http URLs', () => {
    expect(normalizeSettings({ dashboardUrl: 'javascript:alert(1)', apiUrl: 'ftp://x', showFloatingButton: 'yes' })).toEqual({
      showFloatingButton: true,
      askWhereToSave: false,
      dashboardUrl: 'http://localhost:5173',
      apiUrl: '',
      theme: 'system',
    });
    expect(normalizeSettings({ dashboardUrl: 'https://downora.app/' }).dashboardUrl).toBe('https://downora.app');
  });
  it('links into the web app', () => {
    expect(dashboardLink('https://d.app', 'https://cdn.x/a b.mp3', 'audio')).toBe('https://d.app/audio?url=https%3A%2F%2Fcdn.x%2Fa%20b.mp3');
    expect(dashboardLink('https://d.app')).toBe('https://d.app/dashboard');
  });
});

describe('qualityOf / formatBytes', () => {
  const media = { elementId: 'a', kind: 'video' as const, title: '', width: 1920, height: 1080, sources: [] };
  it('labels only known heights', () => {
    expect(qualityOf({ src: 'x', kind: 'video', container: 'mp4', current: true }, media)).toBe('1080p');
    expect(qualityOf({ src: 'x', kind: 'video', container: 'mp4', current: false, height: 2160 }, media)).toBe('4K');
    expect(qualityOf({ src: 'x', kind: 'video', container: 'mp4', current: false }, media)).toBeUndefined();
    expect(qualityOf({ src: 'x', kind: 'audio', container: 'mp3', current: true }, media)).toBeUndefined();
  });
  it('formats sizes', () => {
    expect(formatBytes(492696)).toBe('481 KB');
    expect(formatBytes(undefined)).toBe('');
  });
});

describe('probe', () => {
  it('reads size and type from HEAD', async () => {
    expect(await probe('https://x/a.mp4', fetchOf(res(200, { 'content-length': '1000', 'content-type': 'video/mp4' })))).toEqual({
      ok: true,
      sizeBytes: 1000,
      contentType: 'video/mp4',
    });
  });
  it('falls back to a 1-byte range request when HEAD is refused', async () => {
    const r = await probe('https://x/a.mp4', fetchOf(res(405), res(206, { 'content-range': 'bytes 0-0/5555' })));
    expect(r).toMatchObject({ ok: true, sizeBytes: 5555 });
  });
  it('explains refusals', async () => {
    expect((await probe('https://x/a.mp4', fetchOf(res(403)))).ok).toBe(false);
    expect((await probe('https://x/a.mp4', fetchOf(res(404)))).error).toMatch(/no longer/);
    expect((await probe('https://x/a.mp4', fetchOf(res(200, { 'content-type': 'text/html' })))).error).toMatch(/web page/);
  });
  it('treats an unreachable host as "size unknown", not as an error', async () => {
    expect(await probe('https://x/a.mp4', fetchOf(new TypeError('Failed to fetch')))).toEqual({ ok: true });
  });
});

describe('checkApi', () => {
  it('reports each state honestly', async () => {
    expect(await checkApi('')).toEqual({ state: 'not_configured' });
    expect((await checkApi('https://api', fetchOf(new TypeError('x')))).state).toBe('offline');
    expect((await checkApi('https://api', fetchOf(new Response('{"hello":1}', { status: 200 })))).state).toBe('offline');
    const health = { status: 'ok', service: 'downora-api', version: '0.1.0', capabilities: { analyze: false, downloads: false, transcode: false, auth: false } };
    expect((await checkApi('https://api', fetchOf(new Response(JSON.stringify(health), { status: 200 })))).state).toBe('online');
  });
});

