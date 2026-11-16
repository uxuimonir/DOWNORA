import type { HealthResponse, User } from '@downora/types';
import { create } from 'zustand';
import { API_URL, api, checkApi } from '@/lib/api/client';

export type AccountStatus = 'loading' | 'not_configured' | 'offline' | 'anonymous' | 'signed_in';

interface AccountState {
  status: AccountStatus;
  user?: User;
  health?: HealthResponse;
  init: () => Promise<void>;
  signIn: (mode: 'login' | 'register', email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

let started = false;

export const useAccount = create<AccountState>()((set) => ({
  status: API_URL ? 'loading' : 'not_configured',
  init: async () => {
    if (started) return;
    started = true;
    const s = await checkApi();
    if (s.state !== 'online') return set({ status: s.state === 'not_configured' ? 'not_configured' : 'offline' });
    try {
      const user = await api.me();
      set({ health: s.health, user: user ?? undefined, status: user ? 'signed_in' : 'anonymous' });
    } catch {
      set({ health: s.health, status: 'offline' });
    }
  },
  signIn: async (mode, email, password) => {
    const r = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
    set({ user: r.user, status: 'signed_in' });
  },
  signOut: async () => {
    await api.logout().catch(() => {});
    set({ user: undefined, status: 'anonymous' });
  },
}));

/** Can this browser ask the server to convert files? */
export function canConvert(s: Pick<AccountState, 'status' | 'health'>): boolean {
  return s.status === 'signed_in' && Boolean(s.health?.capabilities.transcode);
}
