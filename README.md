# Downora

**Your media. One click away.** Downora is two products on one backend and one
design system: a web app and a Chrome extension (Manifest V3). It saves only
files you're allowed to have: it never bypasses DRM, sign-ins or paywalls.

## Status

| Part | State |
| --- | --- |
| Web app (`apps/web`) | **Working.** Landing site (17 sections, light/dark/system theme), downloader, history, settings, accounts. Tested on desktop and phone |
| Chrome extension (`apps/extension`) | **Working in Chromium.** Detection, Shadow DOM floating button and panel, glass popup, Chrome downloads, theme, account sign-in, history sync. Not on the Chrome Web Store |
| API (`apps/api`) | **Working.** Accounts, sessions, analysis, server jobs (FFmpeg), history, settings, SSRF guard. SQLite (`node:sqlite`, still marked experimental by Node); jobs are in memory |
| Media engine (`packages/media-engine`) | **Working.** FFmpeg probe and conversion, never upscales |
| Design system (`packages/ui`) | **Working.** Shared tokens and components (web + extension popup) |
| Source adapters (`packages/source-adapters`) | **Working.** Direct MP4, WebM, MP3, M4A and WAV links |
| Postgres migration (`infrastructure/database`) | Draft, not used (the API uses SQLite) |

There is no desktop app.

### What it really does

- **Analyzes a link** in the browser (HEAD/Range, media metadata, preview frame) and, when the API is running, on the server too (`ffprobe` over SSRF-guarded fetches).
- **Lists only formats the file has.** The original file always; MP4/WEBM/MKV/MP3/WAV/M4A conversions only when the API has FFmpeg and you're signed in, and only at or below the source's resolution.
- **Downloads with real progress.** In-browser downloads count real bytes and resume with HTTP Range. Server conversions report real FFmpeg progress, then hand you the file.
- **Accounts.** Email + password (scrypt). The web app uses an HttpOnly cookie; the extension gets a bearer token kept in its own IndexedDB. Both write to the same history.

Known limits: in-browser downloads are held in memory until saved (default cap
1 GB), server jobs vanish when the API restarts, and sites that only stream
(HLS/DASH/MSE) or use DRM aren't supported.

## Run it

Requirements: Node 22 (22.13 or newer), pnpm 10, and FFmpeg for conversions.

```bash
pnpm install
```

### Everything on one address (website + API + downloads)

```bash
pnpm serve
```

Then open http://localhost:8787. This builds the web app, and the API serves
it together with every `/api` route: sign up, analyze links, download
originals, convert on the server (MP4, WebM, MKV, MP3, WAV, M4A when FFmpeg is
installed), and keep history. Your data goes to `apps/api/.data`.

### With Docker

```bash
docker compose up --build
```

Same result at http://localhost:8787, with FFmpeg included. Data lives in the
`downora-data` volume.

### Put it online

Any host that runs a Docker image works (a VPS, Render, Railway, Fly.io and so
on). Use the `Dockerfile`, keep one instance (jobs are in memory), mount a disk
at `/data`, and set:

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | The site's address, e.g. `https://downora.example.com` |
| `COOKIE_SECURE` | `true` (the site must be on HTTPS) |
| `PORT` | Whatever the host gives you (default 8787) |

Static-only hosts (Vercel/Netlify static, GitHub Pages) can't run the server
part, so there the site works in browser-only mode: originals only, no
accounts, no conversions.

### Render

`render.yaml` is a ready Blueprint: Render dashboard → **New → Blueprint** →
pick this repository → **Apply**. It builds the `Dockerfile`, checks
`/api/health`, and mounts a 1 GB disk at `/data`. The site's address is picked
up from Render automatically; set `PUBLIC_ORIGIN` only for a custom domain.
A disk needs a paid instance; on the free plan remove the `disk:` block and
expect accounts and history to be wiped on every restart.

### Development (hot reload)

```bash
pnpm dev:api
```

```bash
VITE_DOWNORA_API_URL=http://localhost:8787 pnpm dev
```

Then open http://localhost:5173.

## Test it

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm e2e
```

The end-to-end suite starts the app plus a local media server
(`apps/web/tests/fixtures/media-server.mjs`) that adds throttling, cross-origin
and no-CORS responses, and errors. It checks real downloads byte for byte,
pausing and resuming from the same byte, canceling, every error state,
persistent settings, history, the mobile menu, and axe accessibility scans on
desktop and phone.

## Layout

```
apps/
  web/          React 19 + Vite + Tailwind 4 web app
  api/          Node + TypeScript REST API (accounts, analysis, jobs, history)
  extension/    Chrome MV3 extension (detection, floating button, popup)
packages/
  types/            Shared domain and API types
  source-adapters/  Which links are supported, and why it's allowed
  ui/               Design tokens and components
  media-engine/     FFmpeg probe + conversion
  config/           Shared tsconfig
infrastructure/database/  SQL migrations
docs/                     Architecture notes
```

## Sample media

`apps/web/public/samples` holds short clips and tones generated by FFmpeg
(`pnpm samples` rebuilds them). They're original, so they're safe to
redistribute and to use in tests.

## Docs

- [docs/backend-integration.md](docs/backend-integration.md): API routes, security, and what's next
- [apps/extension/README.md](apps/extension/README.md): build the extension and install it in Chrome
- [docs/extension-architecture.md](docs/extension-architecture.md): Chrome extension design
