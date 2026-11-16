/**
 * Client for the Downora desktop app's browser bridge (127.0.0.1 only).
 *
 * - The pairing secret lives in this extension's IndexedDB. Content scripts
 *   run in web pages' storage partitions and can't read it.
 * - Every request is signed with HMAC-SHA256 over method, path, timestamp,
 *   a one-time nonce and the body hash (see apps/desktop/crates/core/src/bridge.rs).
 * - Used only from the service worker.
 */

export const DESKTOP_PORT = 47913;
export const DESKTOP_ORIGIN = `http://127.0.0.1:${DESKTOP_PORT}`;
export const DESKTOP_PERMISSION = `${DESKTOP_ORIGIN}/*`;

export interface DesktopKey {
  keyId: string;
  /** Raw secret bytes, base64. */
  secret: string;
  pairedAt: string;
  rotatedAt: string;
  rotateAfterSec: number;
}

// ───────────────────────── key storage (IndexedDB) ─────────────────────────

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('downora-desktop', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = f(d.transaction('keys', mode).objectStore('keys'));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const loadKey = () => tx<DesktopKey | undefined>('readonly', (s) => s.get('desktop') as IDBRequest<DesktopKey | undefined>);
export const saveKey = (k: DesktopKey) => tx('readwrite', (s) => s.put(k, 'desktop'));
export const deleteKey = () => tx('readwrite', (s) => s.delete('desktop'));

// ───────────────────────── signing ─────────────────────────

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function signRequest(secretB64: string, method: string, path: string, body: string, ts: string, nonce: string): Promise<string> {
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', enc.encode(body)));
  const key = await crypto.subtle.importKey('raw', b64ToBytes(secretB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${method}\n${path}\n${ts}\n${nonce}\n${bodyHash}`)));
}

export class DesktopError extends Error {
  constructor(
    message: string,
    /** `offline`: app not running. `auth`: pairing no longer valid. */
    public readonly kind: 'offline' | 'auth' | 'rejected' | 'disabled',
  ) {
    super(message);
  }
}

async function signedFetch(method: 'POST', path: string, body = '', timeoutMs = 4000): Promise<unknown> {
  const key = await loadKey();
  if (!key) throw new DesktopError('Not paired with Downora Desktop.', 'auth');
  const ts = String(Date.now());
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const sig = await signRequest(key.secret, method, path, body, ts, nonce);
  let res: Response;
  try {
    res = await fetch(`${DESKTOP_ORIGIN}${path}`, {
      method,
      body,
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        'x-downora-key': key.keyId,
        'x-downora-timestamp': ts,
        'x-downora-nonce': nonce,
        'x-downora-signature': sig,
      },
    });
  } catch {
    throw new DesktopError('Downora Desktop isn’t running.', 'offline');
  }
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 401 || res.status === 403) throw new DesktopError(json.message ?? 'Pairing is no longer valid.', 'auth');
  if (res.status === 503) throw new DesktopError(json.message ?? 'Browser connection is off in Downora Desktop.', 'disabled');
  if (!res.ok) throw new DesktopError(json.message ?? `Downora Desktop answered with error ${res.status}.`, 'rejected');
  return json;
}

// ───────────────────────── API ─────────────────────────

/** Pairs using the 6-digit code shown in the app. Resolves after the user approves there. */
export async function pair(code: string): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new DesktopError('Enter the 6-digit code shown in Downora Desktop.', 'rejected');
  let res: Response;
  try {
    res = await fetch(`${DESKTOP_ORIGIN}/v1/pair`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, clientName: 'Chrome' }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new DesktopError('Couldn’t reach Downora Desktop. Is it running on this computer?', 'offline');
  }
  const json = (await res.json().catch(() => ({}))) as { keyId?: string; secret?: string; rotateAfterSec?: number; message?: string };
  if (!res.ok || !json.keyId || !json.secret) throw new DesktopError(json.message ?? 'Pairing failed.', 'rejected');
  const now = new Date().toISOString();
  await saveKey({ keyId: json.keyId, secret: json.secret, pairedAt: now, rotatedAt: now, rotateAfterSec: json.rotateAfterSec ?? 43200 });
}

export async function status(): Promise<{ version: string; activeDownloads: number }> {
  return (await signedFetch('POST', '/v1/status')) as { version: string; activeDownloads: number };
}

export interface DesktopJob {
  jobId: string;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled';
  fileName: string;
  bytesReceived: number;
  bytesTotal: number | null;
  error: string | null;
  done: boolean;
}

export async function sendJob(job: { url: string; title: string; container: string; quality?: string }): Promise<{ jobId: string; fileName: string }> {
  return (await signedFetch('POST', '/v1/jobs', JSON.stringify(job))) as { jobId: string; fileName: string };
}

export async function jobStatus(jobId: string): Promise<DesktopJob> {
  return (await signedFetch('POST', `/v1/jobs/${encodeURIComponent(jobId)}`)) as DesktopJob;
}

/** Replaces the secret when it's older than the app asks. */
export async function rotateIfDue(): Promise<boolean> {
  const key = await loadKey();
  if (!key || Date.now() - Date.parse(key.rotatedAt) < key.rotateAfterSec * 1000) return false;
  const res = (await signedFetch('POST', '/v1/rotate')) as { secret: string; rotateAfterSec: number };
  await saveKey({ ...key, secret: res.secret, rotateAfterSec: res.rotateAfterSec, rotatedAt: new Date().toISOString() });
  return true;
}
