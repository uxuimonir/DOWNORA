# Downora for Chrome

Finds supported video and audio on the page you're viewing and puts a small
Downora button on the player. Click it, pick a format the page really offers,
and Chrome saves the file.

**Status:** works in Chromium; 14 browser tests and 33 unit tests pass.
It is **not** published on the Chrome Web Store and hasn't been reviewed by
Google. It does **not** work on every site — see [Limits](#limits).

## Install (developer mode)

You need Node 20.19+ and pnpm 10.

```bash
pnpm install
```

```bash
pnpm ext:build
```

That writes the extension to `apps/extension/dist`. Then, in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `apps/extension/dist` folder.
4. Pin Downora from the puzzle-piece menu so its icon stays in the toolbar.

To update after a code change, run `pnpm ext:build` again and press the
reload arrow on Downora's card in `chrome://extensions`.

## Use it

1. Open a page with a video or audio file.
2. Click the Downora toolbar icon, then **Turn on for this site**. Chrome asks
   for permission for that one site. (Or press **Scan once** to check this page
   without giving lasting access.)
3. A Downora button appears at the top-right of each supported player. Click
   it, choose a format, and press **Download video** or **Download audio**.
4. Progress shows in the panel and in the popup's **Downloads** tab.

**Settings** (popup → Settings): hide the button on videos, ask where to save
each file, turn detection on for all sites, and set the addresses of the
Downora web app and API.

## What it detects

- `<video>` and `<audio>` elements whose file is a direct MP4, WebM, MP3, M4A
  or WAV — by file extension or the `type` attribute — including every
  `<source>` a player lists.
- Players added later (single-page apps, lazy players), through a
  MutationObserver plus media events, batched into one cheap scan.
- Real metadata: duration, resolution of the playing file, poster image,
  and size from a `HEAD` request when the server allows it.
- Quality labels only where known: the playing file's real height, or a height
  the page states (`size="720"`, `label="1080p"`). No made-up 4K or 8K.

## Limits

- **Not detected on purpose:** `blob:`/MediaSource players (adaptive
  streaming, used by most big video sites), HLS/DASH playlists, DRM-protected
  media, and anything behind a sign-in Downora would have to reuse. Many large
  sites therefore show no button — that's expected.
- **No conversion:** audio-only from a video, or other formats, need the
  Downora media service, which isn't built yet. The panel says so.
- **No accounts or history sync:** the Downora API doesn't offer them yet
  (`/api/health` reports `auth: false`). Download history stays in this Chrome
  profile. The extension reads the API's capabilities and only uses what it
  reports; no API key is stored in the extension.
- Players under 200×112 px (ads, hover previews) are skipped.
- The button is hidden in fullscreen so it never covers the video.

## Permissions

| Permission | Why |
| --- | --- |
| `downloads` | Save files with Chrome's own downloader, and show progress |
| `storage` | Settings, the sites you turned on, recent downloads |
| `activeTab` | **Scan once** on the tab you're looking at, only when you ask |
| `scripting` | Run the detector on sites you turned on |
| `alarms` | A once-a-minute check-in with Downora Desktop (when paired) and key rotation |
| Host access — **optional, per site** | Asked for when you press **Turn on for this site**. None at install. **Detect on all sites** asks for broad access and is off by default |

Not requested: `cookies`, `history`, `tabs`, `webRequest`, `<all_urls>` at
install, `externally_connectable` (web pages can't message the extension).
Access to `http://127.0.0.1:47913` (Downora Desktop) is asked for only when you pair.

## Downora Desktop

Popup → Settings → **Desktop app**: enter the 6-digit code from Downora
Desktop (Browser Integration → Pair a browser), then press **Allow** in the app.
After that, downloads go to the desktop app; when it isn't running, Chrome
saves them and the Downloads tab says so. The pairing secret is kept in the
extension's IndexedDB (unreachable from content scripts) and every request is
signed. See [apps/desktop/README.md](../desktop/README.md#security).

## Security

- Every message is validated in the service worker (`src/shared/messages.ts`):
  type, shape, sizes, and that any URL is http(s), has no credentials and is a
  supported file type. Malformed messages get `Rejected message.`
- The content script and the popup get different, narrow message sets; the
  worker decides which by the sender's address.
- In-page UI lives in a Shadow DOM. Page text only ever goes in through
  `textContent`. Buttons ignore synthetic clicks (`event.isTrusted`).
- Probes and downloads never send cookies (`credentials: 'omit'`).
- File names are sanitised: no paths, control characters or reserved names.
- CSP: `script-src 'self'`. No remote code, no `eval`.

## Develop and test

```bash
pnpm --filter @downora/extension test
```

```bash
pnpm ext:e2e
```

The e2e suite builds a **test** variant (`dist-test`, never shipped) that is
pre-granted access to `http://localhost:4600`, the local fixture server, so it
can run without Chrome's permission prompt. It loads the real extension into
Chromium and covers: one video, several players, players added and removed
later, scrolling, unsupported media (blob, HLS, MKV), hostile page CSS, a 403
file, real progress, a dropped connection with Retry, the popup, settings,
permission failures, API errors, message validation, and accessibility (axe)
for the popup and the in-page panel.

Not covered by automated tests: Chrome's real permission prompt (it can't be
clicked from a test), the Web Store review, and third-party sites.

## Layout

```
src/manifest.json        MV3 manifest (production)
src/background/          service worker: permissions, downloads, tab state
src/content/             detector, floating button + panel (Shadow DOM)
src/popup/               React popup using @downora/ui
src/shared/              messages + validation, settings, file names, API client
scripts/build.mjs        Vite build → dist/ (or dist-test/ with --test)
scripts/icons.mjs        renders the toolbar icons
tests/unit/              Vitest
tests/e2e/               Playwright with the real extension loaded
tests/fixtures/          local test server and pages
```
