/**
 * Downora API client for the extension.
 *
 * The API (apps/api) serves health and sources today; analyze, downloads,
 * accounts and history sync answer 501 until Phase 3–4. The extension reads
 * `capabilities` from /api/health and only uses what the server reports.
 * No API key is ever stored in the extension.
 */
import type { HealthResponse } from '@downora/types';

export type ApiStatus =
  | { state: 'not_configured' }
  | { state: 'online'; health: HealthResponse }
  | { state: 'offline'; message: string };

export async function checkApi(apiUrl: string, fetchImpl: typeof fetch = fetch): Promise<ApiStatus> {
  if (!apiUrl) return { state: 'not_configured' };
  try {
    const res = await fetchImpl(`${apiUrl}/api/health`, { credentials: 'omit', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { state: 'offline', message: `The API answered with error ${res.status}.` };
    const body = (await res.json()) as Partial<HealthResponse>;
    if (body.service !== 'downora-api' || typeof body.capabilities !== 'object' || body.capabilities === null) {
      return { state: 'offline', message: 'That address is not a Downora API.' };
    }
    return { state: 'online', health: body as HealthResponse };
  } catch {
    return { state: 'offline', message: 'Couldn’t reach the API.' };
  }
}
