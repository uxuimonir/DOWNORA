import { create } from 'zustand';
import { api, onEngineEvent, type AppInfo, type Browser, type Conversion, type EngineEvent, type Job, type Settings, type StorageInfo } from './ipc';

export interface Activity {
  id: string;
  at: number;
  text: string;
  tone: 'success' | 'danger' | 'neutral';
}

export type PageId = 'overview' | 'downloader' | 'queue' | 'history' | 'converter' | 'browser' | 'settings';

interface State {
  page: PageId;
  go: (p: PageId) => void;
  /** A finished download handed to the converter. */
  convertInput?: string;
  convertDownload: (path: string) => void;
  takeConvertInput: () => string | undefined;
  ready: boolean;
  loadError?: string;
  info?: AppInfo;
  settings?: Settings;
  storage?: StorageInfo;
  jobs: Job[];
  conversions: Conversion[];
  browsers: Browser[];
  connected: boolean;
  pairRequest?: { requestId: string; origin: string; clientName: string };
  activity: Activity[];
  thumbs: Record<string, string | null>;
  init: () => Promise<void>;
  refreshStorage: () => Promise<void>;
  refreshBrowsers: () => Promise<void>;
  setSettings: (s: Settings) => void;
  clearPairRequest: () => void;
  loadThumb: (id: string) => void;
}

const LABEL: Record<string, string> = {
  completed: 'Saved',
  failed: 'Failed',
  canceled: 'Canceled',
};

export const useApp = create<State>()((set, get) => ({
  page: 'overview',
  go: (page) => set({ page }),
  convertDownload: (path) => set({ convertInput: path, page: 'converter' }),
  takeConvertInput: () => {
    const p = get().convertInput;
    if (p) set({ convertInput: undefined });
    return p;
  },
  ready: false,
  jobs: [],
  conversions: [],
  browsers: [],
  connected: false,
  activity: [],
  thumbs: {},

  init: async () => {
    try {
      const [info, settings, jobs, conversions, browsers, storage] = await Promise.all([
        api.appInfo(),
        api.getSettings(),
        api.listDownloads(),
        api.listConversions(),
        api.listBrowsers(),
        api.storageInfo(),
      ]);
      set({ info, settings, jobs, conversions, browsers, storage, connected: info.browserConnected, ready: true });
    } catch (e) {
      set({ loadError: typeof e === 'string' ? e : 'Downora couldn’t start its engine.', ready: true });
      return;
    }
    await onEngineEvent((e: EngineEvent) => {
      const s = get();
      switch (e.type) {
        case 'job': {
          const prev = s.jobs.find((j) => j.id === e.job.id);
          const jobs = prev ? s.jobs.map((j) => (j.id === e.job.id ? e.job : j)) : [e.job, ...s.jobs];
          const changed = prev?.status !== e.job.status && LABEL[e.job.status];
          set({
            jobs,
            activity: changed
              ? [{ id: `${e.job.id}-${e.job.status}`, at: Date.now(), text: `${LABEL[e.job.status]}: ${e.job.title}`, tone: e.job.status === 'completed' ? ('success' as const) : e.job.status === 'failed' ? ('danger' as const) : ('neutral' as const) }, ...s.activity].slice(0, 30)
              : s.activity,
          });
          if (e.job.status === 'completed') void get().refreshStorage();
          if (e.job.thumbnail && s.thumbs[e.job.id] === undefined) get().loadThumb(e.job.id);
          break;
        }
        case 'jobRemoved':
          set({ jobs: s.jobs.filter((j) => j.id !== e.id) });
          break;
        case 'conversion': {
          const prev = s.conversions.find((c) => c.id === e.conversion.id);
          set({ conversions: prev ? s.conversions.map((c) => (c.id === e.conversion.id ? e.conversion : c)) : [e.conversion, ...s.conversions] });
          if (prev?.status === 'running' && e.conversion.status === 'completed') {
            set({ activity: [{ id: `c-${e.conversion.id}`, at: Date.now(), text: `Converted to ${e.conversion.format.toUpperCase()}`, tone: 'success' as const }, ...get().activity].slice(0, 30) });
          }
          break;
        }
        case 'pairRequest':
          set({ pairRequest: { requestId: e.requestId, origin: e.origin, clientName: e.clientName } });
          break;
        case 'pairingChanged':
          void get().refreshBrowsers();
          break;
        case 'browserConnection':
          set({ connected: e.connected });
          break;
        case 'notice':
          break;
      }
    });
  },
  refreshStorage: async () => set({ storage: await api.storageInfo() }),
  refreshBrowsers: async () => set({ browsers: await api.listBrowsers() }),
  setSettings: (settings) => set({ settings }),
  clearPairRequest: () => set({ pairRequest: undefined }),
  loadThumb: (id) => {
    set({ thumbs: { ...get().thumbs, [id]: null } });
    void api.thumbnail(id).then((url) => set({ thumbs: { ...get().thumbs, [id]: url } }));
  },
}));
