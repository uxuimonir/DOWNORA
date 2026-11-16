# Downora Desktop

A Tauri 2 app for Windows, macOS and Linux. It downloads direct media files
with real progress, converts files with FFmpeg, and receives downloads from
the paired Downora Chrome extension.

## Status

| | |
| --- | --- |
| **Linux** | Built and tested here: `.deb` and AppImage bundles were produced, the `.deb` installed and launched |
| **Windows / macOS** | Source and build config are ready, plus a CI workflow (`.github/workflows/desktop.yml`). **Not yet built or run on those systems**: they need Windows or macOS machines/runners |
| **Signed installers** | **None.** Signing needs your Apple Developer ID and a Windows code-signing certificate (see [Code signing](#code-signing)) |
| **Automatic updates** | Not set up: needs a signed release channel. The app says so in Settings |

## What it does

- **Downloader.** Paste a link, see the real details (type, size, resolution and length via FFprobe, whether pause/resume works), choose a folder, download.
- **Download manager.** Queue with a concurrency limit, pause/resume (HTTP Range, verified against `Content-Range`, with `If-Range` so a changed file restarts instead of being stitched), cancel, retry (continues from the partial file when possible), remove, open file, show in folder, open download folder.
  - Each download shows its thumbnail (FFmpeg), format, resolution, size, live progress and speed, and time left once the size is known and the speed is stable.
  - Every number comes from bytes actually written. Finished files are checked: size must match, and the first bytes must really be MP4/WebM/MP3/WAV, or the file is deleted. Disk space is checked before starting. Partial files are hidden, resumable after a restart, and orphans are cleaned at startup.
- **Media converter.** MP4, WebM, MKV, MP3, WAV and M4A, with audio extraction, quality presets (Small never upscales), output folder, live progress, cancel and history.
  - Formats are offered only if the installed FFmpeg has the encoders (`ffmpeg -encoders`).
  - It writes to a temp file and renames at the end, and it **asks before replacing** an existing file, including the original.
- **Browser integration.** Pair the extension with a 6-digit code and an explicit Allow in the app. After that, the extension hands downloads to the app, and falls back to Chrome's own downloads when the app isn't running.
- **Settings.** Default and per-download folder, ask where to save, file name template, duplicates (keep both or replace), concurrency (1–6), speed limit, five notification switches, launch at login, keep running in the tray, browser connection on/off.
  - Theme: dark only; the app says so instead of offering a switch that does nothing.
- **Notifications.** Native notifications for download finished, download failed, conversion finished, not enough storage, and browser connection lost.

## Security

- **Strict capabilities.** `src-tauri/capabilities/default.json` allows only Downora's own commands, plus listening to its events and dragging the window. There's no filesystem, shell or HTTP plugin access from the UI. App commands are declared in `build.rs`, so each needs an explicit permission.
- **Validated commands.** IDs, URLs (http/https only, no credentials), sizes and names are all checked. The UI can only convert, open or write to files and folders the user picked in a native dialog, or files Downora itself downloaded (`commands.rs`).
- **No shell.** Only the FFmpeg/FFprobe binaries are executed, with arguments built in Rust. Remote probing allows only network protocols (`-protocol_whitelist http,https,tcp,tls`).
- **Safe file names.** Reserved names, path separators and control characters are stripped (`names.rs`).
- **Strict CSP.** `script-src 'self'`, no remote code, and frozen prototypes.
- **Browser bridge (`bridge.rs`):**
  - Listens on `127.0.0.1` only, and the `Host` header must match, which blocks DNS rebinding.
  - Only `chrome-extension://` origins are accepted, and no CORS headers are ever sent.
  - Pairing needs a 2-minute 6-digit code (5 attempts, single use) **and** the user's Allow.
  - Every request is HMAC-SHA256 signed over method, path, timestamp, nonce and body hash. Requests older than 30 s and reused nonces are refused.
  - The origin must match the paired extension.
  - Secrets rotate every 12 h, with a 2-minute grace period.
  - Secrets are stored in the macOS Keychain, Windows Credential Manager or Secret Service. If no keychain is available, they go in a file only your user can read (0600), and the app says which.
  - Browsers can only see the jobs they sent.

## Build and run

Prerequisites: Node 20.19+ and pnpm 10, Rust (stable), and the platform's Tauri prerequisites:

- **Windows 10/11:** Microsoft C++ Build Tools and WebView2 (preinstalled on Windows 11).
- **macOS 11+:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux:** `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev patchelf`.

FFmpeg is optional but needed for conversion, thumbnails and resolution detection:

- **macOS:** `brew install ffmpeg`
- **Windows:** `winget install ffmpeg`
- **Linux:** `apt install ffmpeg`

```bash
pnpm install
```

```bash
pnpm --filter @downora/desktop dev
```

### Installers

Each installer has to be built on its own operating system.

```bash
pnpm --filter @downora/desktop tauri build --bundles nsis,msi
```

That produces Windows `.exe` (NSIS, per-user) and `.msi` installers.

```bash
pnpm --filter @downora/desktop tauri build --target universal-apple-darwin --bundles app,dmg
```

That produces a macOS `.app` and `.dmg`; it needs `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

```bash
pnpm --filter @downora/desktop tauri build --bundles deb,appimage
```

That produces Linux `.deb` and AppImage.

Output goes to `apps/desktop/target/**/release/bundle/`. Version metadata (name, version, publisher, copyright, description) is in `src-tauri/tauri.conf.json`. Icons are in `src-tauri/icons/`; regenerate them with `pnpm tauri icon app-icon.png`.

Or let GitHub build all three: **Actions → Desktop → Run workflow**. Installers are attached to the run as artifacts.

## Code signing

Unsigned builds work, but:

- **Windows** shows a SmartScreen warning.
- **macOS** blocks the app ("cannot be opened because the developer cannot be verified") until the user right-clicks → Open.

**macOS (Developer ID + notarization)**

1. Join the Apple Developer Program and create a **Developer ID Application** certificate.
2. Export it as `.p12`. Set these GitHub secrets:
   - `APPLE_CERTIFICATE`: base64 of the `.p12`
   - `APPLE_CERTIFICATE_PASSWORD`
   - `APPLE_SIGNING_IDENTITY`: e.g. `Developer ID Application: Name (TEAMID)`
3. For notarization, set `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`.
4. The workflow already passes these through. Tauri signs with the hardened runtime and `entitlements.plist` (network client and server only), then notarizes and staples.

**Windows (Authenticode)**

1. Get an OV or EV code-signing certificate. EV and Azure Trusted Signing remove SmartScreen warnings fastest.
2. Add `bundle.windows.certificateThumbprint`, `digestAlgorithm: "sha256"` and `timestampUrl` to `tauri.conf.json` (or a `signCommand` for Azure Trusted Signing / HSM-held keys), and make the certificate available on the build machine.

Signed installers should only be announced after a signed build has been installed and checked on a clean machine.

## Testing

```bash
cargo test -p downora-core
```

That's the 41 engine tests, against a local HTTP server and real FFmpeg:

- **Downloads:** progress, pause/resume, cancel, retry, dropped connections, lying Range servers, changed files, fake media, 403/HTML pages, offline, duplicates, speed limit, concurrency, restart recovery.
- **Conversions:** every format, no upscaling, overwrite confirmation, impossible conversions, cancel.
- **Bridge:** pairing, approve/deny, attempt limits, signatures, replay, stale timestamps, wrong origin, DNS rebinding, body tampering, job scoping, rotation, revoke, disabled.

```bash
npx tauri build --debug --no-bundle && node tests/e2e/run.mjs
```

That's the 9 UI tests on the **real app**: tauri-driver + WebKitWebDriver on a virtual display, Linux only. They cover startup, unreachable links, a real download with live progress (bytes compared), pause/resume, cancel, failure + Retry, conversion to MP3 + the replace confirmation, pairing with the approval dialog + signed jobs + replay/bad-signature rejection, and settings saved to disk.

In 5 runs the pause test failed once while waiting for a status change; its timeout has since been raised.

Extension ⇄ desktop: `apps/extension/tests/e2e/desktop.spec.ts` runs the real extension against the real bridge (`cargo build -p downora-core --bin downora-bridge-dev`). It covers pairing, a handed-off download saved by the desktop engine, fallback to Chrome when the app stops, and a denied pairing storing nothing.

**Not tested automatically:**

- Windows and macOS (no runners here).
- Native notifications, the tray and launch-at-login on a real desktop session.
- Opening files and folders (needs a desktop environment's file manager).
- The native file and folder pickers (WebDriver can't drive OS dialogs).
- The OS keychain (this container has no Secret Service, so the file fallback was used).

## Layout

```
crates/core/        engine: download.rs, ffmpeg.rs, bridge.rs, settings.rs, names.rs, media.rs, limiter.rs
  src/bin/downora-bridge-dev.rs   headless engine + bridge for extension tests
  tests/            integration tests (downloads, convert, bridge)
src-tauri/          Tauri shell: commands.rs, keychain.rs, capabilities/, tauri.conf.json, icons/
src/                React UI (pages/, components/, lib/ipc.ts typed commands)
tests/e2e/run.mjs   WebDriver tests against the built app
```
