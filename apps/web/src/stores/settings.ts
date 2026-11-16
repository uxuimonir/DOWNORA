import { DEFAULT_SETTINGS, type UserSettings } from '@downora/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  settings: UserSettings;
  update: (patch: Partial<UserSettings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      reset: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'downora.settings',
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        settings: { ...DEFAULT_SETTINGS, ...((persisted as Partial<SettingsState>)?.settings ?? {}) },
      }),
    },
  ),
);

export function getSettings(): UserSettings {
  return useSettings.getState().settings;
}
