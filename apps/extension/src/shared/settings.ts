/** Extension settings, kept in chrome.storage.sync so they follow the user's Chrome profile. */

export interface ExtensionSettings {
  /** Draw the floating Downora button on detected players. */
  showFloatingButton: boolean;
  /** Ask where to save each file (Chrome's Save As dialog). */
  askWhereToSave: boolean;
  /** Where "Open in Downora" goes. Must be http(s). */
  dashboardUrl: string;
  /** Optional Downora API for account and sync features. Empty = not configured. */
  apiUrl: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  showFloatingButton: true,
  askWhereToSave: false,
  dashboardUrl: 'http://localhost:5173',
  apiUrl: '',
};

export function normalizeSettings(raw: unknown): ExtensionSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof ExtensionSettings, unknown>>;
  const url = (v: unknown, fallback: string) => {
    if (typeof v !== 'string' || v === '') return fallback;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href.replace(/\/$/, '') : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    showFloatingButton: typeof r.showFloatingButton === 'boolean' ? r.showFloatingButton : DEFAULT_SETTINGS.showFloatingButton,
    askWhereToSave: typeof r.askWhereToSave === 'boolean' ? r.askWhereToSave : DEFAULT_SETTINGS.askWhereToSave,
    dashboardUrl: url(r.dashboardUrl, DEFAULT_SETTINGS.dashboardUrl),
    apiUrl: r.apiUrl === '' ? '' : url(r.apiUrl, ''),
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get('settings');
  return normalizeSettings(stored.settings);
}

export async function saveSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.sync.set({ settings: next });
  return next;
}

/** Link that opens a media URL in the Downora web app's downloader. */
export function dashboardLink(dashboardUrl: string, mediaUrl?: string, kind: 'video' | 'audio' = 'video'): string {
  return mediaUrl ? `${dashboardUrl}/${kind}?url=${encodeURIComponent(mediaUrl)}` : `${dashboardUrl}/dashboard`;
}
