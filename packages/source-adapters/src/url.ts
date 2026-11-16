/**
 * URL validation shared by every surface.
 *
 * This is input hygiene, not the server's SSRF defence. The API must still
 * resolve the host and check the destination address (and every redirect hop)
 * against private ranges — see docs/backend-integration.md.
 */

export type UrlRejection =
  | 'empty'
  | 'malformed'
  | 'unsupported_scheme'
  | 'credentials_in_url'
  | 'missing_host';

export type UrlValidation =
  | { ok: true; url: URL }
  | { ok: false; reason: UrlRejection; message: string };

const MESSAGES: Record<UrlRejection, string> = {
  empty: 'Paste a link to a media file to get started.',
  malformed: 'That doesn’t look like a complete link. It should start with https://',
  unsupported_scheme: 'Only http and https links are supported.',
  credentials_in_url:
    'This link has a username or password in it. Remove them — Downora never sends credentials.',
  missing_host: 'This link is missing a site address.',
};

function reject(reason: UrlRejection): UrlValidation {
  return { ok: false, reason, message: MESSAGES[reason] };
}

export function validateMediaUrl(input: string): UrlValidation {
  const raw = input.trim();
  if (!raw) return reject('empty');

  // People paste `example.com/clip.mp4` — accept it as https.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return reject('malformed');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject('unsupported_scheme');
  if (url.username || url.password) return reject('credentials_in_url');
  if (!url.hostname || (!url.hostname.includes('.') && url.hostname !== 'localhost')) {
    return reject(url.hostname ? 'malformed' : 'missing_host');
  }

  return { ok: true, url };
}

/** Lower-cased file extension of the URL path, without the dot. */
export function extensionOf(url: URL | string): string | null {
  const pathname = typeof url === 'string' ? url : url.pathname;
  const last = pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  if (dot <= 0 || dot === last.length - 1) return null;
  return last.slice(dot + 1).toLowerCase();
}

/** Human title and safe base file name derived from a URL path. */
export function namesFromPath(pathname: string): { title: string; baseName: string } {
  let last = pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    last = decodeURIComponent(last);
  } catch {
    /* keep the raw segment */
  }
  const dot = last.lastIndexOf('.');
  const stem = dot > 0 ? last.slice(0, dot) : last;
  const baseName = sanitizeFileName(stem) || 'download';
  const title = stem.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled media';
  return { title, baseName };
}

/** Strips characters that are invalid in file names on Windows, macOS or Linux. */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 120);
}
