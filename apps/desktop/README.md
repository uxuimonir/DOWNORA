# Downora desktop (Phase 6)

**Status: not started.** No Tauri project exists yet, and there are no installers.

Plan:

- **Shell:** Tauri 2 (Rust) hosting the same React UI as `apps/web`, sharing `@downora/ui` and `@downora/types`.
- **Engine:** downloads run in Rust (reqwest, streamed straight to disk), so there's no in-memory size limit. Range requests make pause and resume survive app restarts.
- **Safety:** the same rules as the API's SSRF guard and source adapters. The engine only fetches URLs the adapters accept.
- **Media:** FFmpeg runs as a bundled sidecar binary for the conversions defined in `@downora/media-engine`.
- **Features:** queue, a download folder picker, native notifications, history in SQLite, and preferences.
- **Browser integration:** a localhost-only, token-authenticated bridge so the extension can hand jobs to the desktop app.

Building it needs Rust (installed in this environment, 1.97), the Tauri CLI, and
the platform toolchains: WebView2 and MSVC on Windows, Xcode Command Line Tools
on macOS. Windows and macOS installers can only be produced and signed on those
operating systems (or CI runners for them). They'll be published once they've
been built and tested there.
