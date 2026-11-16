/**
 * Content script entry. Injected only on sites the user turned on, or once
 * via "Scan this page" (activeTab). Reports detected media to the service
 * worker and draws the floating button.
 */
import type { ExtensionDownload } from '@downora/types';
import type { ContentMessage, ProbeResult, Result } from '../shared/messages';
import { loadSettings } from '../shared/settings';
import { watch } from './detect';
import { Overlay } from './overlay';

declare global {
  interface Window {
    __downoraContent?: boolean;
  }
}

function send<T>(message: ContentMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

async function main() {
  // Registered script + "Scan this page" can both inject: run once.
  if (window.__downoraContent || window.top !== window) return;
  window.__downoraContent = true;

  const settings = await loadSettings();
  const overlay = new Overlay({
    probe: (url) => send<ProbeResult>({ type: 'media/probe', url }).catch(() => ({ ok: true }) as ProbeResult),
    download: (source, media) =>
      send<Result<{ id: number }>>({
        type: 'download/start',
        request: { url: source.src, title: media.title, container: source.container, kind: source.kind },
      }).catch(() => ({ ok: false, error: 'Downora’s background service didn’t respond. Reload the page and try again.' })),
    openInDashboard: (source) => void send({ type: 'dashboard/open', url: source.src }),
  });
  overlay.setVisible(settings.showFloatingButton);

  watch((detections) => {
    overlay.update(detections);
    void send({ type: 'media/update', media: detections.map((d) => d.media) }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as { type?: string; downloads?: ExtensionDownload[] };
    if (m?.type === 'downloads/changed' && Array.isArray(m.downloads)) overlay.onDownloads(m.downloads);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      const next = changes.settings.newValue as { showFloatingButton?: boolean } | undefined;
      overlay.setVisible(next?.showFloatingButton !== false);
    }
  });
}

void main();
