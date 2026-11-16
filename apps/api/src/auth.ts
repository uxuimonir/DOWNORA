/**
 * Email + password accounts.
 * - Passwords: scrypt (N=2^15, r=8, p=1), random salt, constant-time compare.
 * - Sessions: 32 random bytes; only a SHA-256 of the token is stored.
 *   The web app gets an HttpOnly SameSite=Lax cookie; the extension gets a
 *   bearer token (it can't share the site's cookies), revocable by signing out.
 * - Sign-in attempts are rate limited per email and per IP.
 */
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import type { User } from '@downora/types';
import type { Database } from './db';

const PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_DAYS = 30;
export const COOKIE = 'dn_session';

function scrypt(pw: string, salt: Buffer, len: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(pw, salt, len, PARAMS, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

export function validateCredentials(email: unknown, password: unknown): string | null {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Enter a valid email address.';
  if (typeof password !== 'string' || password.length < 10) return 'Use a password of at least 10 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

type Row = { id: string; email: string; password_hash: string; created_at: string };
const toUser = (r: Row): User => ({ id: r.id, email: r.email, createdAt: r.created_at });

export async function createUser(db: Database, email: string, password: string): Promise<User | 'exists'> {
  const normalized = email.trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalized)) return 'exists';
  const row: Row = { id: randomUUID(), email: normalized, password_hash: await hashPassword(password), created_at: new Date().toISOString() };
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(row.id, row.email, row.password_hash, row.created_at);
  return toUser(row);
}

// A real hash so a missing account takes as long as a wrong password.
let dummy: Promise<string> | undefined;

export async function checkLogin(db: Database, email: string, password: string): Promise<User | null> {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as Row | undefined;
  if (!row) {
    await verifyPassword(password, await (dummy ??= hashPassword('not-a-real-password')));
    return null;
  }
  return (await verifyPassword(password, row.password_hash)) ? toUser(row) : null;
}

export function createSession(db: Database, userId: string, client: 'web' | 'extension'): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, client, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
    sha(token),
    userId,
    client,
    Date.now() + SESSION_DAYS * 86_400_000,
    new Date().toISOString(),
  );
  return token;
}

export function userForToken(db: Database, token: string | undefined): User | null {
  if (!token || token.length > 100) return null;
  const row = db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .get(sha(token), Date.now()) as Row | undefined;
  return row ? toUser(row) : null;
}

export function deleteSession(db: Database, token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

export function pruneSessions(db: Database) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

/** Fixed-window limiter for sign-in attempts. */
export class Attempts {
  private map = new Map<string, { n: number; until: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  blocked(key: string): boolean {
    const e = this.map.get(key);
    return Boolean(e && e.until > Date.now() && e.n >= this.max);
  }
  fail(key: string) {
    const e = this.map.get(key);
    if (!e || e.until < Date.now()) this.map.set(key, { n: 1, until: Date.now() + this.windowMs });
    else e.n += 1;
  }
  clear(key: string) {
    this.map.delete(key);
  }
}
