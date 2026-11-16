# Chrome extension architecture (Phase 5)

Status: design. Nothing here is implemented yet.

## Pieces

| Piece | Runs in | Job |
| --- | --- | --- |
| Content script | The page (isolated world) | Finds `<video>`/`<audio>` elements, checks them against the source adapters, and draws the Downora button |
| Service worker | The extension | Keeps per-tab media state, starts downloads with `chrome.downloads`, and tracks their progress |
| Popup | The toolbar action | Shows media on the current tab, a box to paste a link, recent downloads, settings, and a link to open the dashboard |

All three import `@downora/source-adapters` and `@downora/types`, bundled at
build time with Vite. Nothing is loaded remotely, and the MV3 content security
policy (`script-src 'self'`) enforces that.

## Detection

1. A `MutationObserver` on `document` watches for added `video`, `audio` and `source` elements, plus changes to their `src` attribute. A `loadedmetadata` listener catches players that swap sources later.
2. For each element, read `currentSrc`. Ignore `blob:` and `mediasource:` URLs: those are MSE streams, usually HLS or DASH and often DRM-protected, and are never offered. Ignore anything `matchUrl` rejects.
3. Elements under 200×112 px, or hidden, are skipped so ads and previews don't get buttons.
4. The content script sends `media/detected` (see `ExtensionMessage` in `@downora/types`) with the URL, kind, dimensions and duration only. It never sends page text, cookies, other URLs or browsing history.

## The floating button

- It's a single host element attached to `document.documentElement`, with a **closed Shadow DOM**, so page CSS can't style it and it can't style the page. Every style is inlined from the design tokens.
- It's positioned with `getBoundingClientRect()` of the video, in the **top-right corner, 12 px inset**, away from the bottom controls bar. A `ResizeObserver` and passive scroll and resize listeners (throttled to animation frames) keep it aligned.
- It's 36 px, with `pointer-events` only on the button itself. It never covers player controls, and the user can drag it to any corner, remembered per site in `chrome.storage.local`.
- Clicking it opens the picker in the same shadow root: thumbnail (captured only when the video is CORS-clean), title, resolution, format, size from a HEAD request, and Download.

## Downloads

`chrome.downloads.download({ url, filename, saveAs:false })` from the service
worker. The browser sends its own request, so files work even when the server
blocks other sites from reading them (the case the web app has to hand off).
Progress comes from `chrome.downloads.onChanged` (`bytesReceived`/`totalBytes`),
and pause and resume use `chrome.downloads.pause/resume`. These are real
browser-tracked numbers.

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
