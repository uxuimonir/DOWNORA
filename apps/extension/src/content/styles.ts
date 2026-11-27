/**
 * Styles for the in-page button and panel. Lives inside a Shadow DOM, so the
 * page can't restyle it and it can't leak into the page. Values mirror the
 * web app's design tokens (packages/ui/src/styles/theme.css).
 */
export const OVERLAY_CSS = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.layer {
  --canvas: #0b0b0c; --surface: #121213; --raised: #18181a; --hover: #1f1f22;
  --line: #2a2a2e; --ink: #f5f5f5; --muted: #a1a1a6; --faint: #8e8e93;
  --accent: #7c4ff0; --accent-ink: #b4a0fb; --sky: #38bdf8; --danger: #ff6b6b; --success: #34d399;
  --glass: #121213; --fab: rgb(11 11 12 / 0.8); --tint: rgb(255 255 255 / 0.05); --tint2: rgb(255 255 255 / 0.09);
  --shadow: 0 24px 60px -12px rgb(0 0 0 / 0.75);
  font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  position: fixed; inset: 0; pointer-events: none;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  .layer {
    --canvas: #fafafa; --surface: #ffffff; --raised: #f4f4f5; --hover: #eeeeef;
    --line: #e7e7e7; --ink: #111111; --muted: #5f5f5f; --faint: #6e6e6e;
    --accent: #7047eb; --accent-ink: #5b32d6; --sky: #2585e8; --danger: #c62828; --success: #047857;
    --glass: #ffffff; --fab: rgb(255 255 255 / 0.85); --tint: rgb(0 0 0 / 0.03); --tint2: rgb(0 0 0 / 0.06);
    --shadow: 0 24px 60px -16px rgb(30 27 75 / 0.28);
    color-scheme: light;
  }
}
/* Mono mark: white tile on dark pages' glass, black on light. */
.lt { fill: #fff; } .lg { stroke: #000; }
@media (prefers-color-scheme: light) { .lt { fill: #000; } .lg { stroke: #fff; } }
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Floating button: 36 px, top-right of the player, clear of the bottom control bar. */
.fab {
  pointer-events: auto; position: fixed; width: 36px; height: 36px; border-radius: 999px;
  display: grid; place-items: center;
  background: var(--fab); -webkit-backdrop-filter: saturate(180%) blur(16px); backdrop-filter: saturate(180%) blur(16px);
  box-shadow: 0 0 0 1px var(--line), 0 6px 18px rgb(0 0 0 / 0.3);
  opacity: 0.88; transition: opacity .15s, transform .15s;
}
.fab:hover, .fab:focus-visible, .fab[aria-expanded="true"] { opacity: 1; transform: scale(1.06); }
.fab:active { transform: scale(0.94); }
.fab svg { width: 22px; height: 22px; }
.fab[hidden] { display: none; }
/* Bigger touch target without a bigger button. */
.fab::after { content: ''; position: absolute; inset: -4px; }

/* Panel */
.panel {
  pointer-events: auto; position: fixed; width: 320px; max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px); overflow: auto;
  background: var(--glass);
  -webkit-backdrop-filter: saturate(180%) blur(24px); backdrop-filter: saturate(180%) blur(24px);
  border: 1px solid var(--line); border-radius: 14px;
  box-shadow: var(--shadow);
  animation: pop .18s cubic-bezier(.22,1,.36,1);
}
@keyframes pop { from { opacity: 0; transform: translateY(4px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .panel { animation: none; } .fab { transition: none; } }
@media (prefers-reduced-transparency: reduce) { .panel, .fab { background: var(--raised); -webkit-backdrop-filter: none; backdrop-filter: none; } }
@media (forced-colors: active) { .fab, .panel { border: 1px solid CanvasText; } }

.head { display: flex; gap: 12px; padding: 14px; }
.thumb { width: 88px; aspect-ratio: 16/9; flex: none; border-radius: 8px; border: 1px solid var(--line); background: var(--hover); overflow: hidden; display: grid; place-items: center; color: var(--faint); }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb svg { width: 22px; height: 22px; }
.title { font-size: 15px; font-weight: 600; letter-spacing: -.01em; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.meta { margin-top: 3px; font-size: 12px; color: var(--muted); }
.close { margin-left: auto; align-self: flex-start; width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; color: var(--muted); flex: none; position: relative; }
.close::after { content: ''; position: absolute; inset: -8px; }
.close:hover { background: var(--hover); color: var(--ink); }
.close svg { width: 16px; height: 16px; }

.label { font: 500 11px/16px 'JetBrains Mono', ui-monospace, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); padding: 4px 16px 6px; }
.list { margin: 0 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); overflow: hidden; }
.opt { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--line); }
.opt:last-child { border-bottom: 0; }
.opt:hover { background: var(--tint); }
.opt input { accent-color: var(--accent); width: 18px; height: 18px; flex: none; }
.opt .name { font-weight: 600; font-size: 14px; }
.opt .q { color: var(--accent-ink); font-weight: 600; margin-left: 6px; }
.opt .sub { font-size: 12px; color: var(--muted); }
.opt .size { margin-left: auto; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.note { font-size: 12px; color: var(--faint); padding: 8px 16px 0; line-height: 1.45; }
.error { margin: 10px 14px 0; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); font-size: 13px; }

.actions { display: grid; gap: 8px; padding: 14px; }
.btn { min-height: 44px; border-radius: 10px; font-weight: 600; font-size: 15px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 16px; }
.btn svg { width: 18px; height: 18px; }
.btn.primary { background: var(--accent); color: #fff; box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.18); transition: filter .15s, transform .15s; }
.btn.primary:hover { filter: brightness(1.08); }
.btn.secondary { background: var(--surface); border: 1px solid var(--line); color: var(--ink); }
.btn.secondary:hover { background: var(--hover); }
.btn:disabled { opacity: .4; cursor: not-allowed; }
.btn:active:not(:disabled) { transform: scale(.98); }

.progress { padding: 4px 14px 0; }
.progress .row { display: flex; justify-content: space-between; font-size: 13px; }
.progress .pct { font-size: 22px; font-weight: 300; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.track { margin-top: 8px; height: 8px; background: var(--tint2); overflow: hidden;
  -webkit-mask-image: repeating-linear-gradient(90deg,#000 0 5px,transparent 5px 7px); mask-image: repeating-linear-gradient(90deg,#000 0 5px,transparent 5px 7px); }
.track > div { height: 100%; background: var(--accent); transition: width .3s ease-out; }
.track.done > div { background: var(--success); }
.track.indeterminate > div { width: 40% !important; animation: sweep 1.4s linear infinite; }
@keyframes sweep { from { transform: translateX(-100%); } to { transform: translateX(350%); } }
.status { margin-top: 6px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.ok { color: var(--success); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;

/** Downora mark, same drawing as the web app's LogoMark. */
export const LOGO_SVG = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect class="lt" width="32" height="32" rx="9.5" fill="#000000"/><g class="lg" stroke="#FFFFFF" stroke-linecap="round"><path d="M10 7.5h6.2c4.9 0 8.3 3.4 8.3 8.1 0 2.3-.8 4.3-2.2 5.8" stroke-width="2.6"/><path d="M10 7.5v10.2" stroke-width="2.6"/><path d="M16 12.5v8.2m0 0-3.4-3.4m3.4 3.4 3.4-3.4" stroke-width="2.4" stroke-linejoin="round"/><path d="M9.5 24.6h13" stroke-width="2.6"/></g></svg>`;

export const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m0 12-4-4m4 4 4-4M2 17l.6 2.4A2 2 0 0 0 4.5 21h15a2 2 0 0 0 1.9-1.6L22 17"/></svg>',
  external:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 12h18M3 7.5h4M3 16.5h4M17 7.5h4M17 16.5h4"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
};
