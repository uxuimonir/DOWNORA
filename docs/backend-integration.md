# Backend (`apps/api`)

One API serves both products: the web app (cookie session) and the Chrome
extension (bearer token). Node `http`, SQLite via `node:sqlite`, FFmpeg via
`@downora/media-engine`.

## Routes

| Route | What it does |
| --- | --- |
| `GET /api/health` | Version and `capabilities` (auth, history, conversion) plus FFmpeg `outputs` |
| `GET /api/sources` | Adapter registry from `@downora/source-adapters` |
| `POST /api/auth/register`, `/login`, `/logout`; `GET /api/auth/me` | Email + password accounts (scrypt). Web: HttpOnly `dn_session` cookie. Extension: `client: 'extension'` returns a token |
| `POST /api/media/analyze` | SSRF-guarded fetch of the first bytes + `ffprobe` → real formats only |
| `GET /api/media/:id/formats` | Formats for an analysis |
| `POST/GET /api/downloads`, `GET/DELETE /api/downloads/:id`, `GET /api/downloads/:id/file` | Signed-in server jobs: fetch, convert, stream back. Owner only. Files expire (`JOB_TTL_MIN`) |
| `GET/POST/DELETE /api/history`, `DELETE /api/history/:id` | Per-user history (web, extension and server entries) |
| `GET/PUT /api/user/settings` | Per-user settings |

## Security

- **SSRF:** every remote URL goes through `vetUrl` (scheme, port, private/reserved IPs). The HTTP agent's DNS lookup is pinned to the vetted address (no rebinding) and redirects are followed manually, each one vetted again. `ALLOW_PRIVATE_HOSTS` exists for local tests and is ignored when `NODE_ENV=production`.
- **Sessions:** only a SHA-256 of each token is stored. Cookie requests that change state need an allowed `Origin` and a JSON body (CSRF). Login attempts are rate limited and timing-equalised.
- **Files:** byte cap (`MAX_FILE_MB`), temp files renamed only when complete, jobs readable only by their owner, filenames sanitised.
- **Sources:** jobs are created only for formats from a fresh analysis of an adapter that allows server fetching. No DRM, paywall or sign-in bypass.

## Not done

- Jobs live in memory: a restart drops them. A persistent queue is needed for more than one server.
- SQLite on local disk; `node:sqlite` is still experimental in Node 22. The Postgres draft in `infrastructure/database` is unused.
- No email verification or password reset yet.
