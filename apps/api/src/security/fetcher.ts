/**
 * The only way the API fetches a remote URL.
 *
 * - Each hop is vetted with `vetUrl` (DNS resolved, every address public).
 * - The TCP connection is pinned to the vetted address, so a DNS answer that
 *   changes between check and connect (rebinding) can't redirect us.
 * - Redirects are followed by hand (max 5) and every target is vetted again.
 * - No cookies or credentials are ever sent.
 */
import { Agent, fetch as undiciFetch, type Response } from 'undici';
import type { LookupFunction } from 'node:net';
import { UnsafeUrlError, vetUrl, type SafeTarget } from './ssrf';

export interface GuardedOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  signal?: AbortSignal;
  maxRedirects?: number;
  resolve?: Parameters<typeof vetUrl>[1];
}

function pinnedAgent(target: SafeTarget): Agent {
  const lookup: LookupFunction = (_host, opts, cb) => {
    const o = opts as { all?: boolean };
    if (o.all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: target.address, family: target.family }]);
    else cb(null, target.address, target.family);
  };
  return new Agent({ connect: { lookup, timeout: 15_000 }, headersTimeout: 20_000, bodyTimeout: 30_000 });
}

export async function guardedFetch(url: string, opts: GuardedOptions = {}): Promise<{ response: Response; finalUrl: URL }> {
  let current = url;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop += 1) {
    const target = await vetUrl(current, opts.resolve);
    const dispatcher = pinnedAgent(target);
    const response = await undiciFetch(target.url, {
      method: opts.method ?? 'GET',
      headers: { 'user-agent': 'Downora/0.1 (+https://github.com/uxuimonir/downora)', ...opts.headers },
      redirect: 'manual',
      signal: opts.signal,
      dispatcher,
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel().catch(() => {});
      current = new URL(response.headers.get('location')!, target.url).href;
      continue;
    }
    return { response, finalUrl: target.url };
  }
  throw new UnsafeUrlError('too_many_redirects', 'The link redirected too many times.');
}
