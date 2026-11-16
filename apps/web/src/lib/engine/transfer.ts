/**
 * Low-level streaming reader. Kept free of store/DOM code so it can be unit
 * tested in Node with a real `Response`.
 */

export interface TransferProgress {
  bytesReceived: number;
  bytesTotal?: number;
  speedBps?: number;
  etaSec?: number;
}

export interface TransferResult {
  chunks: Uint8Array[];
  bytesReceived: number;
  bytesTotal?: number;
  /** True when the server answered 206 to our Range request. */
  resumedFromOffset: boolean;
  acceptsRanges: boolean;
  contentType?: string;
}

export class TransferError extends Error {
  constructor(
    public readonly code: 'http' | 'too_large' | 'incomplete' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'TransferError';
  }
}

export interface TransferOptions {
  url: string;
  /** Bytes already held from an earlier attempt. */
  existing?: Uint8Array[];
  existingBytes?: number;
  maxBytes: number;
  signal: AbortSignal;
  onProgress: (progress: TransferProgress) => void;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Minimum gap between progress callbacks, so React isn't flooded. */
const PROGRESS_INTERVAL_MS = 120;

export async function runTransfer(options: TransferOptions): Promise<TransferResult> {
  const { url, signal, maxBytes, onProgress } = options;
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => performance.now());

  const offset = options.existingBytes ?? 0;
  const headers: Record<string, string> = {};
  if (offset > 0) headers.Range = `bytes=${offset}-`;

  let response: Response;
  try {
    response = await doFetch(url, { mode: 'cors', credentials: 'omit', headers, signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new TransferError('network', 'The connection failed before the download could start.');
  }

  if (!response.ok) {
    throw new TransferError('http', `The server answered with error ${response.status}.`);
  }

  const resumed = offset > 0 && response.status === 206;
  const chunks = resumed ? [...(options.existing ?? [])] : [];
  let received = resumed ? offset : 0;

  const contentRange = response.headers.get('content-range');
  const rangeTotal = contentRange?.match(/\/(\d+)\s*$/)?.[1];
  const length = response.headers.get('content-length');
  const total = resumed
    ? rangeTotal
      ? Number(rangeTotal)
      : length
        ? offset + Number(length)
        : undefined
    : length
      ? Number(length)
      : undefined;

  if (total && total > maxBytes) {
    void response.body?.cancel();
    throw new TransferError('too_large', 'This file is larger than the in-browser limit set in Settings.');
  }

  const acceptsRanges = resumed || (response.headers.get('accept-ranges')?.includes('bytes') ?? false);
  if (!response.body) throw new TransferError('network', 'The server sent an empty response.');

  const reader = response.body.getReader();
  const startedAt = now();
  const startBytes = received;
  let lastEmit = 0;
  let speed: number | undefined;

  const emit = (force = false) => {
    const t = now();
    if (!force && t - lastEmit < PROGRESS_INTERVAL_MS) return;
    const elapsed = (t - startedAt) / 1000;
    if (elapsed > 0.25) {
      const instant = (received - startBytes) / elapsed;
      speed = speed === undefined ? instant : speed * 0.6 + instant * 0.4;
    }
    lastEmit = t;
    onProgress({
      bytesReceived: received,
      bytesTotal: total,
      speedBps: speed,
      etaSec: total && speed ? (total - received) / speed : undefined,
    });
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new TransferError('too_large', 'This file is larger than the in-browser limit set in Settings.');
      }
      emit();
    }
  } catch (error) {
    if (error instanceof TransferError || signal.aborted) {
      // Hand back what arrived so a pause can resume from it.
      Object.assign(error as object, { partial: { chunks, bytesReceived: received, acceptsRanges } });
      throw error;
    }
    throw Object.assign(new TransferError('network', 'The connection dropped during the download.'), {
      partial: { chunks, bytesReceived: received, acceptsRanges },
    });
  }

  emit(true);
  if (total !== undefined && received !== total) {
    throw new TransferError('incomplete', `Only ${received} of ${total} bytes arrived.`);
  }

  return {
    chunks,
    bytesReceived: received,
    bytesTotal: total ?? received,
    resumedFromOffset: resumed,
    acceptsRanges,
    contentType: response.headers.get('content-type') ?? undefined,
  };
}

export interface PartialTransfer {
  chunks: Uint8Array[];
  bytesReceived: number;
  acceptsRanges: boolean;
}

export function partialOf(error: unknown): PartialTransfer | undefined {
  return (error as { partial?: PartialTransfer } | null)?.partial;
}
