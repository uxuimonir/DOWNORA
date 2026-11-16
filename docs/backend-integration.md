# Backend integration (Phase 3–4)

## What exists today (`apps/api`)

| Route | Status |
| --- | --- |
| `GET /api/health` | Working. Reports `capabilities` (all `false` until built) |
| `GET /api/sources` | Working. Serves the adapter registry from `@downora/source-adapters` |
| `POST /api/media/analyze` | `501 not_implemented` |
| `GET /api/media/:id/formats` | `501` |
| `POST /api/downloads`, `GET /api/downloads[/:id]`, `DELETE /api/downloads/:id` | `501` |
| `GET /api/user/settings` | `501` |

Also in place: CORS allow-list (`CORS_ORIGINS`), per-IP rate limiting
(`RATE_LIMIT_PER_MINUTE`), JSON error shape (`ApiError`), request logging,
`nosniff`. The SSRF guard (`src/security/ssrf.ts`) is implemented and
unit-tested, but nothing calls it until analyze ships.

Request and response types for every route are already defined in
`packages/types/src/index.ts`, and the web app's client
(`apps/web/src/lib/api/client.ts`) is written against them.

## Phase 3 plan

1. **Framework:** move the routing to Hono (Node adapter), with zod schemas for each request type.
2. **Database:** apply `infrastructure/database/migrations/0001_init.sql` to Supabase or Postgres. Data access goes through a thin repository layer, so plain Postgres and Supabase both work.
3. **Auth:** Supabase Auth (email magic link and OAuth). The API verifies the JWT on each request. RLS policies are drafted in the migration.
4. **Settings and history:** sync `UserSettings` and `DownloadJob` rows, merging with the browser's local history the first time a user signs in.

## Phase 4: real analysis and server downloads

- **Analyze:** `vetUrl` → HEAD through an HTTP agent whose `lookup` returns the vetted address (stops DNS rebinding) → follow redirects manually through `vetRedirectChain` → `ffprobe` on the first MB using a Range request → `MediaAnalysis`.
- **Jobs:** a Postgres-backed queue (`pg-boss`) runs the workers. Workers stream to object storage with a hard byte cap, never buffering the whole file in memory. Produced files expire (`expires_at`), and a cleanup job deletes them.
- **Conversion:** `@downora/media-engine` wraps FFmpeg. Only conversions that never upscale are offered (e.g. 1080p → 720p, never 720p → 4K), and the format list marks them `delivery: 'transcode'`.
- **Authorization:** a job is only created for formats returned by a fresh analysis of an adapter whose `permission` allows server-side fetching.

## Credentials you will need to provide

| For | Variable | Where |
| --- | --- | --- |
| Database | `DATABASE_URL` | Supabase project → Database settings, or your own Postgres |
| Auth | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase project → API settings |
| Server-only admin | `SUPABASE_SERVICE_ROLE_KEY` | Same place. Never expose it to the web app |
| File storage | bucket name + keys | Supabase Storage or S3-compatible |

None of these are needed for the web app to run today.
