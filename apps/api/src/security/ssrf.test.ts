import { describe, expect, it } from 'vitest';
import { isPublicAddress, vetRedirectChain, vetUrl } from './ssrf';

const dns = (map: Record<string, string[]>) => async (host: string) =>
  (map[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

describe('isPublicAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1'])(
    'blocks %s',
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe('vetUrl', () => {
  it('accepts a public host', async () => {
    const t = await vetUrl('https://cdn.example.com/a.mp4', dns({ 'cdn.example.com': ['93.184.216.34'] }));
    expect(t.address).toBe('93.184.216.34');
  });
  it('rejects names that resolve to private addresses', async () => {
    await expect(vetUrl('https://evil.example/a.mp4', dns({ 'evil.example': ['127.0.0.1'] }))).rejects.toMatchObject({ code: 'private_address' });
  });
  it('rejects when any record is private', async () => {
    await expect(vetUrl('https://mixed.example/a.mp4', dns({ 'mixed.example': ['93.184.216.34', '10.0.0.5'] }))).rejects.toMatchObject({ code: 'private_address' });
  });
  it('rejects literal private IPs, localhost and metadata endpoints', async () => {
    for (const u of ['http://127.0.0.1/a.mp4', 'http://[::1]/a.mp4', 'http://169.254.169.254/latest/meta-data', 'http://localhost/a.mp4']) {
      await expect(vetUrl(u, dns({}))).rejects.toMatchObject({ code: expect.stringMatching(/private_address|invalid_url/) });
    }
  });
  it('rejects unusual ports and non-http schemes', async () => {
    await expect(vetUrl('https://cdn.example.com:22/a.mp4', dns({ 'cdn.example.com': ['93.184.216.34'] }))).rejects.toMatchObject({ code: 'bad_port' });
    await expect(vetUrl('file:///etc/passwd')).rejects.toMatchObject({ code: 'invalid_url' });
  });
});

describe('vetRedirectChain', () => {
  it('blocks a redirect into a private network', async () => {
    const resolve = dns({ 'ok.example': ['93.184.216.34'], 'inner.example': ['192.168.0.10'] });
    await expect(
      vetRedirectChain('https://ok.example/a.mp4', async () => ({ status: 302, location: 'https://inner.example/x' }), 5, resolve),
    ).rejects.toMatchObject({ code: 'private_address' });
  });
  it('stops after too many hops', async () => {
    const resolve = dns({ 'ok.example': ['93.184.216.34'] });
    await expect(
      vetRedirectChain('https://ok.example/a.mp4', async () => ({ status: 301, location: '/again' }), 3, resolve),
    ).rejects.toMatchObject({ code: 'too_many_redirects' });
  });
});
