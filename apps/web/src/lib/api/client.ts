/**
 * Client for the Downora API (Phase 3).
 *
 * Only the health check is wired today. When `VITE_DOWNORA_API_URL` is unset
 * the app reports the API as "not configured" instead of pretending.
 */
import type { HealthResponse } from '@downora/types';

export const API_URL: string | undefined = import.meta.env.VITE_DOWNORA_API_URL?.replace(/\/$/, '') || undefined;

export type ApiStatus =
  | { state: 'not_configured' }
  | { state: 'online'; health: HealthResponse }
  | { state: 'offline'; message: string };

export async function checkApi(signal?: AbortSignal): Promise<ApiStatus> {
  if (!API_URL) return { state: 'not_configured' };
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal, credentials: 'omit' });
    if (!res.ok) return { state: 'offline', message: `Health check failed (HTTP ${res.status}).` };
    return { state: 'online', health: (await res.json()) as HealthResponse };
  } catch {
    return { state: 'offline', message: `Couldn’t reach ${API_URL}.` };
  }
}
