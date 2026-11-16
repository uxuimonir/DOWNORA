# Chrome extension architecture (Phase 5)

Status: implemented in `apps/extension` (see its README for what's tested and what isn't). Differences from the original design are noted inline.

## Pieces

| Piece | Runs in | Job |
| --- | --- | --- |
| Content script | The page (isolated world) | Finds `<video>`/`<audio>` elements, checks them against the source adapters, and draws the Downora button |
| Service worker | The extension | Keeps per-tab media state, starts downloads with `chrome.downloads`, and tracks their progress |
| Popup | The toolbar action | Shows the tab's access state, media on the tab with quick downloads, recent downloads, settings, account status, and a link to open the dashboard. *(No paste box: pasting links lives in the web app.)* |

All three import `@downora/source-adapters` and `@downora/types`, bundled at
build time with Vite. Nothing is loaded remotely, and the MV3 content security
policy (`script-src 'self'`) enforces that.

## Detection

1. A `MutationObserver` on `document` watches for added or removed `video`, `audio` and `source` elements, plus changes to `src`/`poster`. Capture-phase `loadedmetadata`, `emptied` and `resize` listeners catch players that swap sources later. Bursts are batched into one scan (250 ms), and nothing is sent unless the result changed.
2. For each element, read `currentSrc`. Ignore `blob:` and `mediasource:` URLs: those are MSE streams, usually HLS or DASH and often DRM-protected, and are never offered. Ignore anything `matchUrl` rejects.
3. Elements under 200×112 px, or hidden, are skipped so ads and previews don't get buttons.
4. The content script sends `media/update` (`DetectedMedia` in `@downora/types`): file URLs, kind, title, poster, dimensions and duration only. It never sends page text, cookies, other URLs or browsing history.

## The floating button

- It's a single host element attached to `document.documentElement`, with a Shadow DOM, so page CSS can't style it and it can't style the page. *Built with an open root* so automated tests can reach it; page scripts still can't trigger downloads, because every click handler requires `event.isTrusted`. Every style is inlined from the design tokens.
- It's positioned with `getBoundingClientRect()` of the video, in the **top-right corner, 10 px inset** (pinned inside the visible part when the top scrolls away; beside the controls for audio), away from the bottom controls bar. A `ResizeObserver` and passive scroll and resize listeners (throttled to animation frames) keep it aligned.
- It's 36 px, with `pointer-events` only on the button itself, and hidden in fullscreen. *Not built:* dragging it to another corner.
- Clicking it opens the panel in the same shadow root: poster thumbnail (when the page has one), title, source, duration, resolution, the formats the page offers with sizes from a HEAD request, Download, and Open in Downora.

## Downloads

`chrome.downloads.download({ url, filename, saveAs:false })` from the service
worker. The browser sends its own request, so files work even when the server
blocks other sites from reading them (the case the web app has to hand off).
Progress comes from `chrome.downloads.onChanged` (`bytesReceived`/`totalBytes`),
and pause and resume use `chrome.downloads.pause/resume`. These are real
browser-tracked numbers.

## Downora Desktop hand-off

When paired (see apps/desktop/README.md), `startDownload` first sends a signed `POST /v1/jobs` to `127.0.0.1:47913`; progress comes from signed `POST /v1/jobs/:id` polls. If the app is offline, disabled or the pairing is invalid, `chrome.downloads` is used instead and the entry carries a note. All signed calls are POST because Chrome omits `Origin` on extension GETs.

## Permissions (minimum)

- `downloads`, `storage`, `activeTab`.
- **No** `<all_urls>` at install. Host access is requested per site with `chrome.permissions.request` the first time a user turns on detection for that site (`optional_host_permissions`), and the content script is registered for those sites only with `chrome.scripting.registerContentScripts` (this adds the `scripting` permission).
- No `cookies`, `webRequest`, `history`, `tabs` (beyond `activeTab`) or `debugger`.

## Will never

Read cookies or credentials, bypass DRM (EME/MSE sources are ignored), inject
remote code, or send browsing data anywhere.

## Tests

- Unit (Vitest + happy-dom): detection filters, positioning maths, message reducers.
- Integration (Playwright with `--load-extension` in Chromium): fixture pages served by `apps/web/tests/fixtures/media-server.mjs`. Covers a plain `<video>`, a player that loads its source late, a `blob:` MSE player (must stay hidden), a page whose CSS tries to restyle the button, and the full download through `chrome.downloads`.
