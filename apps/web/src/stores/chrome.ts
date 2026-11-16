import { create } from 'zustand';

/** Shared state for the iOS-style navigation bar. */
interface ChromeState {
  /** Current page's large title. */
  title: string;
  /** True once the large title has scrolled under the bar. */
  collapsed: boolean;
  set: (patch: Partial<Pick<ChromeState, 'title' | 'collapsed'>>) => void;
}

export const useChrome = create<ChromeState>()((set) => ({
  title: '',
  collapsed: false,
  set: (patch) => set(patch),
}));
