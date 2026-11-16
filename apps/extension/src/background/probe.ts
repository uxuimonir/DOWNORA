import type { ProbeResult } from '../shared/messages';

/**
 * Asks the server about a media file without downloading it: HEAD, or a
 * 1-byte Range request when HEAD isn't allowed. No cookies are sent.
 */
export async function probe(url: string, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  const read = (res: Response, ranged: boolean): ProbeResult => {
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `The site refused access (error ${res.status}). Downora never signs in for you.` };
    }
    if (res.status === 404 || res.status === 410) return { ok: false, error: 'The file is no longer at this address.' };
    if (res.status >= 400) return { ok: false, error: `The server answered with error ${res.status}.` };
    const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (type === 'text/html') return { ok: false, error: 'This address opens a web page, not a media file.' };
    const total = ranged ? res.headers.get('content-range')?.match(/\/(\d+)$/)?.[1] : res.headers.get('content-length');
    const size = total ? Number(total) : undefined;
    return { ok: true, sizeBytes: size && Number.isFinite(size) ? size : undefined, contentType: type };
  };
  try {
    const signal = AbortSignal.timeout(8000);
    const head = await fetchImpl(url, { method: 'HEAD', credentials: 'omit', redirect: 'follow', signal });
    if (head.status !== 405 && head.status !== 501) return read(head, false);
    const ranged = await fetchImpl(url, { headers: { Range: 'bytes=0-0' }, credentials: 'omit', signal });
    void ranged.body?.cancel();
    return read(ranged, ranged.status === 206);
  } catch {
    // No access to that host, or the server blocks other origins. Chrome can
    // still download it; we just can't show the size in advance.
    return { ok: true };
  }
}

