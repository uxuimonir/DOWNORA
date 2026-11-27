/**
 * Client for the Downora API. Cookies carry the session (HttpOnly), so this
 * file never sees a token. When `VITE_DOWNORA_API_URL` is unset the app runs
 * browser-only and says so — nothing is faked.
 */
import type { AuthResponse, HealthResponse, HistoryEntry, MediaAnalysis, ServerJob, User } from '@downora/types';

const RAW_API = import.meta.env.VITE_DOWNORA_API_URL?.trim();
/** `same-origin` = the API serves this site too (one-server deploy). */
export const API_URL: string | undefined =
  RAW_API === 'same-origin' ? (typeof window !== 'undefined' ? window.location.origin : undefined) : RAW_API?.replace(/\/$/, '') || undefined;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'not_configured', 'Downora’s server isn’t connected.');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      credentials: 'include',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new ApiError(0, 'offline', 'Couldn’t reach Downora’s server.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
  if (!res.ok) throw new ApiError(res.status, json.error?.code ?? 'error', json.error?.message ?? `Server error ${res.status}.`);
  return json as T;
}

export type ApiStatus =
  | { state: 'not_configured' }
  | { state: 'online'; health: HealthResponse }
  | { state: 'offline'; message: string };

export async function checkApi(signal?: AbortSignal): Promise<ApiStatus> {
  if (!API_URL) return { state: 'not_configured' };
  try {
    return { state: 'online', health: await request<HealthResponse>('/api/health', { signal }) };
  } catch {
    return { state: 'offline', message: `Couldn’t reach ${API_URL}.` };
  }
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me').then((r) => r.user),
  register: (email: string, password: string) => request<AuthResponse>('/api/auth/register', { body: { email, password } }),
  login: (email: string, password: string) => request<AuthResponse>('/api/auth/login', { body: { email, password } }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST', body: {} }),
  analyze: (url: string, signal?: AbortSignal) => request<MediaAnalysis>('/api/media/analyze', { body: { url }, signal }),
  createJob: (mediaId: string, formatId: string) => request<ServerJob>('/api/downloads', { body: { mediaId, formatId } }),
  job: (id: string) => request<ServerJob>(`/api/downloads/${id}`),
  cancelJob: (id: string) => request<{ ok: true }>(`/api/downloads/${id}`, { method: 'DELETE' }),
  fileUrl: (id: string) => `${API_URL}/api/downloads/${id}/file`,
  history: () => request<{ items: HistoryEntry[] }>('/api/history').then((r) => r.items),
  addHistory: (e: Omit<HistoryEntry, 'id' | 'createdAt'>) => request<HistoryEntry>('/api/history', { body: e }),
  deleteHistory: (id: string) => request<{ ok: true }>(`/api/history/${id}`, { method: 'DELETE' }),
  clearHistory: () => request<{ ok: true }>('/api/history', { method: 'DELETE' }),
};
