/**
 * SSRF guard for every URL the server will fetch.
 *
 * Validating the string is not enough: a public-looking hostname can resolve
 * to 127.0.0.1 or a cloud metadata address. So we resolve the host, reject any
 * private, loopback, link-local or reserved address, and repeat the check for
 * every redirect hop (redirects are followed manually, never by fetch).
 *
 * To stop DNS rebinding between the check and the connection, the Phase 4
 * fetcher must connect to the exact address returned here (custom lookup on
 * the HTTP agent), not resolve the name a second time.
 */
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { validateMediaUrl } from '@downora/source-adapters';

const blocked = new BlockList();
// IPv4
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
// IPv6
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  // IPv4-mapped (::ffff:a.b.c.d) is unwrapped and checked as IPv4 in isPublicAddress.
  // Don't list it here: BlockList matches plain IPv4 against it and blocks everything.
  ['64:ff9b::', 96], // NAT64
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return !blocked.check(mapped[1], 'ipv4');
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

export class UnsafeUrlError extends Error {
  constructor(
    public readonly code: 'invalid_url' | 'private_address' | 'unresolvable' | 'bad_port' | 'too_many_redirects',
    message: string,
  ) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export interface SafeTarget {
  url: URL;
  /** The vetted address the fetcher must connect to. */
  address: string;
  family: 4 | 6;
}

type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
const defaultResolver: Resolver = (host) => lookup(host, { all: true, verbatim: true });

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

/**
 * Hosts that may be private — **development and tests only** (e.g. the web
 * app's own sample files on localhost). Empty in production.
 */
let privateAllowlist = new Set<string>();
export function allowPrivateHosts(hosts: string[]) {
  privateAllowlist = new Set(hosts.map((h) => h.trim().toLowerCase()).filter(Boolean));
}

export async function vetUrl(input: string, resolve: Resolver = defaultResolver): Promise<SafeTarget> {
  const validation = validateMediaUrl(input);
  if (!validation.ok) throw new UnsafeUrlError('invalid_url', validation.message);
  const { url } = validation;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (privateAllowlist.has(host.toLowerCase())) {
    return { url, address: host === 'localhost' ? '127.0.0.1' : host, family: isIP(host) === 6 ? 6 : 4 };
  }
  if (!ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError('bad_port', `Port ${url.port} is not allowed.`);

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('private_address', 'Links to private networks are not allowed.');
  }

  let records: { address: string; family: number }[];
  if (isIP(host)) {
    records = [{ address: host, family: isIP(host) }];
  } else {
    try {
      records = await resolve(host);
    } catch {
      throw new UnsafeUrlError('unresolvable', `Couldn’t find the server ${host}.`);
    }
  }
  if (records.length === 0) throw new UnsafeUrlError('unresolvable', `Couldn’t find the server ${host}.`);
  // Every record must be public: an attacker controls which one a client picks.
  if (records.some((r) => !isPublicAddress(r.address))) {
    throw new UnsafeUrlError('private_address', 'Links to private networks are not allowed.');
  }
  const first = records[0]!;
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 };
}

/** Resolves and vets each redirect target. `fetchHop` must not follow redirects itself. */
export async function vetRedirectChain(
  start: string,
  fetchHop: (target: SafeTarget) => Promise<{ status: number; location?: string }>,
  maxHops = 5,
  resolve?: Resolver,
): Promise<SafeTarget> {
  let current = await vetUrl(start, resolve);
  for (let hop = 0; hop <= maxHops; hop += 1) {
    const { status, location } = await fetchHop(current);
    if (status < 300 || status >= 400 || !location) return current;
    current = await vetUrl(new URL(location, current.url).href, resolve);
  }
  throw new UnsafeUrlError('too_many_redirects', 'The link redirected too many times.');
}
