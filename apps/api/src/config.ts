import { join } from 'node:path';

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export interface Config {
  port: number;
  /** Browser origins allowed to call the API with credentials. */
  corsOrigins: Set<string>;
  rateLimitPerMinute: number;
  dataDir: string;
  /** Largest source file a server job will fetch. */
  maxFileBytes: number;
  /** Finished files are deleted after this. */
  jobTtlMs: number;
  concurrentJobs: number;
  /** Send cookies only over HTTPS. Must be true in production. */
  secureCookies: boolean;
  /** Dev/test only: private hosts the SSRF guard lets through. */
  allowPrivateHosts: string[];
  /** Built web app to serve at `/` (one-server deploy). Empty = API only. */
  webDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    // PUBLIC_ORIGIN is the site's own address when the API also serves the web app.
    corsOrigins: new Set([...list(env.CORS_ORIGINS ?? 'http://localhost:5173'), ...list(env.PUBLIC_ORIGIN)]),
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 240),
    dataDir: env.DATA_DIR ?? join(process.cwd(), '.data'),
    maxFileBytes: Number(env.MAX_FILE_MB ?? 1024) * 1024 * 1024,
    jobTtlMs: Number(env.JOB_TTL_MIN ?? 60) * 60_000,
    concurrentJobs: Number(env.CONCURRENT_JOBS ?? 2),
    secureCookies: env.COOKIE_SECURE === 'true',
    // Dev/test only: never honoured in production.
    allowPrivateHosts: env.NODE_ENV === 'production' ? [] : list(env.ALLOW_PRIVATE_HOSTS),
    webDir: env.WEB_DIR ?? '',
  };
}
