/**
 * The floating Downora button and its download panel.
 *
 * - One shadow host for the whole page (no per-player DOM injected into the
 *   site's own tree), so site CSS can't style it and layouts don't shift.
 * - One button per detected player, pinned top-right — away from the native
 *   control bar at the bottom. Follows the player on scroll, resize and
 *   layout changes; hidden when the player is off-screen or gone.
 * - Clicks must be real user clicks (`isTrusted`): page scripts can't press
 *   the buttons to trigger downloads.
 * - Page-provided strings are only ever set with textContent.
 */
import { qualityLabelFor } from '@downora/source-adapters';
import type { DetectedMedia, DetectedSource, ExtensionDownload } from '@downora/types';
import type { ProbeResult, Result } from '../shared/messages';
import type { Detection } from './detect';
import { ICONS, LOGO_SVG, OVERLAY_CSS } from './styles';

export interface OverlayBridge {
  probe(url: string): Promise<ProbeResult>;
  download(source: DetectedSource, media: DetectedMedia): Promise<Result<{ id: number }>>;
  openInDashboard(source: DetectedSource, media: DetectedMedia): void;
}

interface Entry {
  el: HTMLMediaElement;
  media: DetectedMedia;
  fab: HTMLButtonElement;
}

interface PanelState {
  id: string;
  node: HTMLElement;
  selected: string;
  probes: Map<string, ProbeResult | 'loading'>;
  downloadId?: number;
  starting: boolean;
  error?: string;
}

const FAB = 36;
const INSET = 10;
const PANEL_W = 320;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

function svg(markup: string): Element {
  const t = document.createElement('template');
  t.innerHTML = markup; // static, extension-owned markup only
  return t.content.firstElementChild!;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatDuration(sec?: number): string {
  if (!sec) return '';
  const s = Math.round(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** Only real numbers: a quality label appears only when the height is known. */
export function qualityOf(source: DetectedSource, media: DetectedMedia): string | undefined {
  if (source.kind !== 'video') return undefined;
  if (source.current && media.width && media.height) return qualityLabelFor(media.width, media.height);
  if (source.height) return qualityLabelFor(Math.round((source.height * 16) / 9), source.height);
  return undefined;
}

export class Overlay {
  private host: HTMLElement;
  private layer: HTMLElement;
  private entries = new Map<string, Entry>();
  private panel: PanelState | null = null;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private downloads: ExtensionDownload[] = [];
  private visible = true;

  constructor(private bridge: OverlayBridge) {
    this.host = document.createElement('downora-overlay');
    this.host.setAttribute('style', 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;');
    const root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    this.layer = h('div', { class: 'layer' });
    root.append(style, this.layer);
    document.documentElement.append(this.host);

    this.resizeObserver = new ResizeObserver(() => this.schedule());
    window.addEventListener('scroll', this.schedule, { capture: true, passive: true });
    window.addEventListener('resize', this.schedule, { passive: true });
    document.addEventListener('pointerdown', this.onOutside, true);
    document.addEventListener('keydown', this.onKey, true);
    document.addEventListener('fullscreenchange', this.schedule);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.closePanel(false);
    this.schedule();
  }

  /** Sync buttons with the latest detection pass: add new, update changed, drop gone. */
  update(detections: Detection[]): void {
    const live = new Set<string>();
    for (const { el, media } of detections) {
      live.add(media.elementId);
      const existing = this.entries.get(media.elementId);
      if (existing) {
        existing.media = media;
        existing.fab.setAttribute('aria-label', `Download with Downora: ${media.title}`);
        continue;
      }
      const fab = h('button', {
        class: 'fab',
        type: 'button',
        'aria-label': `Download with Downora: ${media.title}`,
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'data-downora-fab': media.elementId,
      });
      fab.append(svg(LOGO_SVG));
      fab.addEventListener('click', (e) => {
        if (!e.isTrusted) return;
        e.stopPropagation();
        if (this.panel?.id === media.elementId) this.closePanel(true);
        else this.openPanel(media.elementId);
      });
      this.layer.append(fab);
      this.entries.set(media.elementId, { el, media, fab });
      this.resizeObserver.observe(el);
    }
    for (const [id, entry] of this.entries) {
      if (!live.has(id)) {
        if (this.panel?.id === id) this.closePanel(false);
        this.resizeObserver.unobserve(entry.el);
        entry.fab.remove();
        this.entries.delete(id);
      }
    }
    if (this.panel) this.renderPanel();
    this.schedule();
  }

  onDownloads(downloads: ExtensionDownload[]): void {
    this.downloads = downloads;
    if (this.panel?.downloadId !== undefined) this.renderPanel();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener('scroll', this.schedule, { capture: true });
    window.removeEventListener('resize', this.schedule);
    document.removeEventListener('pointerdown', this.onOutside, true);
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('fullscreenchange', this.schedule);
    this.host.remove();
  }

  // ───────────────────────── positioning ─────────────────────────

  private schedule = (): void => {
    if (!this.frame) this.frame = requestAnimationFrame(this.position);
  };

  private position = (): void => {
    this.frame = 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const { el, fab } of this.entries.values()) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const onScreen = r.bottom > FAB && r.top < vh - FAB && r.right > FAB && r.left < vw;
      const shown =
        this.visible && el.isConnected && !document.fullscreenElement && onScreen && style.visibility !== 'hidden' && r.width > 0;
      fab.hidden = !shown;
      if (!shown) continue;
      // Audio players are short: centre the button vertically beside the controls.
      const top = el instanceof HTMLAudioElement ? r.top + (r.height - FAB) / 2 : Math.max(r.top, 0) + INSET;
      const left = el instanceof HTMLAudioElement ? Math.min(r.right + 8, vw - FAB - 4) : r.right - FAB - INSET;
      fab.style.top = `${Math.round(top)}px`;
      fab.style.left = `${Math.round(Math.max(4, left))}px`;
    }
    this.placePanel();
  };

  private placePanel(): void {
    const p = this.panel;
    if (!p) return;
    const entry = this.entries.get(p.id);
    if (!entry || entry.fab.hidden) return;
    const b = entry.fab.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ph = p.node.offsetHeight;
    const left = Math.min(Math.max(8, b.right - PANEL_W), vw - Math.min(PANEL_W, vw - 16) - 8);
    let top = b.bottom + 8;
    if (top + ph > vh - 8) top = b.top - ph - 8 >= 8 ? b.top - ph - 8 : Math.max(8, vh - ph - 8);
    p.node.style.left = `${Math.round(left)}px`;
    p.node.style.top = `${Math.round(top)}px`;
  }

  // ───────────────────────── panel ─────────────────────────

  private openPanel(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.closePanel(false);
    const preferred = entry.media.sources.find((s) => s.current) ?? entry.media.sources[0]!;
    const node = h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'downora-panel-title' });
    this.panel = { id, node, selected: preferred.src, probes: new Map(), starting: false };
    this.layer.append(node);
    entry.fab.setAttribute('aria-expanded', 'true');
    this.renderPanel();
    this.schedule();
    node.querySelector<HTMLElement>('input:checked, .btn.primary')?.focus();

    for (const s of entry.media.sources) {
      this.panel.probes.set(s.src, 'loading');
      void this.bridge.probe(s.src).then((result) => {
        if (this.panel?.id !== id) return;
        this.panel.probes.set(s.src, result);
        // Move the selection off a file the server refused.
        if (!result.ok && this.panel.selected === s.src) {
          const usable = entry.media.sources.find((x) => {
            const pr = this.panel?.probes.get(x.src);
            return pr === 'loading' || (pr && pr.ok);
          });
          if (usable) this.panel.selected = usable.src;
        }
        this.renderPanel();
      });
    }
  }

  private closePanel(returnFocus: boolean): void {
    if (!this.panel) return;
    const entry = this.entries.get(this.panel.id);
    this.panel.node.remove();
    this.panel = null;
    entry?.fab.setAttribute('aria-expanded', 'false');
    if (returnFocus) entry?.fab.focus();
  }

  private onOutside = (e: PointerEvent): void => {
    if (this.panel && !e.composedPath().includes(this.host)) this.closePanel(false);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.panel) {
      e.stopPropagation();
      this.closePanel(true);
    }
  };

  private renderPanel(): void {
    const p = this.panel;
    if (!p) return;
    const entry = this.entries.get(p.id);
    if (!entry) return;
    const { media } = entry;
    const focusedKey = (this.host.shadowRoot?.activeElement as HTMLElement | null)?.dataset.key;

    const host = (() => {
      try {
        return new URL(media.sources[0]!.src).host;
      } catch {
        return '';
      }
    })();
    const meta = [host, formatDuration(media.durationSec), media.width && media.height ? `${media.width} × ${media.height}` : '']
      .filter(Boolean)
      .join(' · ');

    const thumb = h('div', { class: 'thumb' });
    if (media.poster) {
      const img = h('img', { alt: '' });
      img.referrerPolicy = 'no-referrer';
      img.src = media.poster;
      img.addEventListener('error', () => img.replaceWith(svg(media.kind === 'audio' ? ICONS.music : ICONS.film)));
      thumb.append(img);
    } else thumb.append(svg(media.kind === 'audio' ? ICONS.music : ICONS.film));

    const close = h('button', { class: 'close', type: 'button', 'aria-label': 'Close', 'data-key': 'close' });
    close.append(svg(ICONS.close));
    close.addEventListener('click', (e) => e.isTrusted && this.closePanel(true));

    const title = h('p', { class: 'title', id: 'downora-panel-title' });
    title.textContent = media.title;
    const sub = h('p', { class: 'meta' });
    sub.textContent = meta;
    const head = h('div', { class: 'head' }, thumb, h('div', { style: 'min-width:0' }, title, sub), close);

    const children: Node[] = [head];
    const download = p.downloadId !== undefined ? this.downloads.find((d) => d.id === p.downloadId) : undefined;

    if (p.downloadId !== undefined) {
      children.push(this.renderProgress(download, media));
    } else {
      // Format list: only files the page really offers.
      const list = h('div', { class: 'list', role: 'radiogroup', 'aria-label': 'Available formats' });
      const groupName = `downora-${p.id}`;
      for (const s of media.sources) {
        const probe = p.probes.get(s.src);
        const refused = probe !== undefined && probe !== 'loading' && !probe.ok;
        const quality = qualityOf(s, media);
        const sizeText =
          probe === 'loading' || probe === undefined
            ? 'Checking…'
            : probe.ok
              ? probe.sizeBytes
                ? formatBytes(probe.sizeBytes)
                : 'Size not reported'
              : 'Unavailable';
        const input = h('input', { type: 'radio', name: groupName, value: s.src, 'data-key': `opt-${s.src}` });
        input.checked = p.selected === s.src;
        input.disabled = refused;
        input.addEventListener('change', (e) => {
          if (!e.isTrusted) return;
          p.selected = s.src;
          this.renderPanel();
        });
        const name = h('span', { class: 'name' }, s.container.toUpperCase(), quality ? h('span', { class: 'q' }, quality) : null);
        const subText = refused ? (probe as ProbeResult).error ?? 'The server refused this file.' : s.current ? 'Playing now, original file' : 'Original file';
        list.append(
          h(
            'label',
            { class: 'opt', style: refused ? 'opacity:.55;cursor:not-allowed' : undefined },
            input,
            h('span', { style: 'min-width:0' }, name, h('span', { class: 'sub', style: 'display:block' }, subText)),
            h('span', { class: 'size' }, sizeText),
          ),
        );
      }
      children.push(h('p', { class: 'label' }, media.kind === 'audio' ? 'Audio' : 'Formats'), list);
      if (media.kind === 'video') {
        children.push(
          h('p', { class: 'note' }, 'Only qualities this page actually offers are listed. Audio only needs Downora’s conversion service, which isn’t connected yet.'),
        );
      }

      const allRefused = media.sources.every((s) => {
        const pr = p.probes.get(s.src);
        return pr !== undefined && pr !== 'loading' && !pr.ok;
      });
      const errorText = p.error ?? (allRefused ? 'This file can’t be downloaded. The site may require signing in, or the link has expired.' : undefined);
      if (errorText) children.push(h('p', { class: 'error', role: 'alert' }, errorText));

      const selected = media.sources.find((s) => s.src === p.selected) ?? media.sources[0]!;
      const dl = h('button', { class: 'btn primary', type: 'button', 'data-key': 'download' });
      dl.append(svg(ICONS.download), media.kind === 'audio' ? 'Download audio' : 'Download video');
      dl.disabled = allRefused || p.starting;
      dl.addEventListener('click', (e) => {
        if (!e.isTrusted || !this.panel) return;
        this.panel.starting = true;
        this.panel.error = undefined;
        this.renderPanel();
        void this.bridge.download(selected, media).then((res) => {
          if (this.panel?.id !== p.id) return;
          this.panel.starting = false;
          if (res.ok) this.panel.downloadId = res.data.id;
          else this.panel.error = res.error;
          this.renderPanel();
        });
      });
      const open = h('button', { class: 'btn secondary', type: 'button', 'data-key': 'open' });
      open.append(svg(ICONS.external), 'Open in Downora');
      open.addEventListener('click', (e) => e.isTrusted && this.bridge.openInDashboard(selected, media));
      children.push(h('div', { class: 'actions' }, dl, open));
    }

    p.node.replaceChildren(...children);
    if (focusedKey) p.node.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusedKey)}"]`)?.focus();
    this.placePanel();
  }

  private renderProgress(d: ExtensionDownload | undefined, media: DetectedMedia): Node {
    const wrap = h('div', { class: 'progress', 'data-testid': 'downora-progress' });
    const fraction = d?.bytesTotal ? d.bytesReceived / d.bytesTotal : undefined;
    const done = d?.state === 'complete';
    const failed = d?.state === 'interrupted';
    const heading = done
      ? d?.via === 'desktop'
        ? 'Saved by Downora Desktop'
        : 'Saved to your Downloads folder'
      : failed
        ? 'Download failed'
        : d?.via === 'desktop'
          ? 'Downora Desktop is downloading'
          : 'Downloading';
    const pct = done ? '100%' : fraction !== undefined ? `${Math.floor(fraction * 100)}%` : '';
    wrap.append(
      h('div', { class: 'row' }, h('span', { class: done ? 'ok' : undefined, role: 'status' }, heading), h('span', { class: 'pct' }, pct)),
    );
    const track = h('div', {
      class: `track${done ? ' done' : ''}${!done && fraction === undefined && !failed ? ' indeterminate' : ''}`,
      role: 'progressbar',
      'aria-label': `Download progress for ${media.title}`,
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': done ? '100' : fraction !== undefined ? String(Math.floor(fraction * 100)) : undefined,
    });
    const fill = h('div');
    fill.style.width = `${done ? 100 : (fraction ?? 0) * 100}%`;
    track.append(fill);
    wrap.append(track);
    const status = h('p', { class: 'status' });
    status.textContent = failed
      ? d?.error ?? 'Chrome stopped the download.'
      : d
        ? `${formatBytes(d.bytesReceived) || '0 B'}${d.bytesTotal ? ` of ${formatBytes(d.bytesTotal)}` : ''} · ${d.fileName}`
        : 'Starting…';
    wrap.append(status);
    const again = h('button', { class: 'btn secondary', type: 'button', 'data-key': 'again' }, done ? 'Download another format' : failed ? 'Try again' : 'Back');
    again.addEventListener('click', (e) => {
      if (!e.isTrusted || !this.panel) return;
      this.panel.downloadId = undefined;
      this.renderPanel();
    });
    return h('div', {}, wrap, h('div', { class: 'actions' }, again));
  }
}
