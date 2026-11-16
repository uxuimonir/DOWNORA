/**
 * Downora account for the extension (same accounts as the web app).
 * The API gives extensions a bearer token instead of a cookie; it's kept in
 * this extension's IndexedDB, which content scripts (running in web pages'
 * storage) can't read. Used only from the service worker.
 */
import type { HistoryEntry, User } from '@downora/types';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('downora-account', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function kv<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = f(d.transaction('kv', mode).objectStore('kv'));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

interface Stored {
  apiUrl: string;
  token: string;
  user: User;
}
const load = () => kv<Stored | undefined>('readonly', (s) => s.get('session') as IDBRequest<Stored | undefined>);
const save = (v: Stored) => kv('readwrite', (s) => s.put(v, 'session'));
const clear = () => kv('readwrite', (s) => s.delete('session'));

async function call<T>(apiUrl: string, path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      credentials: 'omit',
      signal: AbortSignal.timeout(10_000),
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new Error('Couldn’t reach Downora’s server.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Server error ${res.status}.`);
  return json as T;
}

export interface AccountState {
  signedIn: boolean;
  email?: string;
  /** The stored session was for a different API address. */
  stale?: boolean;
}

export async function state(apiUrl: string): Promise<AccountState> {
  const s = await load().catch(() => undefined);
  if (!s) return { signedIn: false };
  if (s.apiUrl !== apiUrl) return { signedIn: false, stale: true };
  try {
    const me = await call<{ user: User | null }>(apiUrl, '/api/auth/me', { token: s.token });
    if (!me.user) {
      await clear();
      return { signedIn: false };
    }
    return { signedIn: true, email: me.user.email };
  } catch {
    // Offline: keep the session, report what we know.
    return { signedIn: true, email: s.user.email };
  }
}

export async function signIn(apiUrl: string, email: string, password: string): Promise<AccountState> {
  const r = await call<{ user: User; token?: string }>(apiUrl, '/api/auth/login', { body: { email, password, client: 'extension' } });
  if (!r.token) throw new Error('This server didn’t issue an extension session.');
  await save({ apiUrl, token: r.token, user: r.user });
  return { signedIn: true, email: r.user.email };
}

export async function signOut(): Promise<void> {
  const s = await load().catch(() => undefined);
  if (s) await call(s.apiUrl, '/api/auth/logout', { method: 'POST', token: s.token }).catch(() => {});
  await clear();
}

/** Best effort: adds a finished download to the account's history. */
export async function recordHistory(apiUrl: string, entry: Omit<HistoryEntry, 'id' | 'createdAt' | 'source'>): Promise<boolean> {
  const s = await load().catch(() => undefined);
  if (!s || s.apiUrl !== apiUrl || !apiUrl) return false;
  try {
    await call(apiUrl, '/api/history', { body: { ...entry, source: 'extension' }, token: s.token });
    return true;
  } catch {
    return false;
  }
}
