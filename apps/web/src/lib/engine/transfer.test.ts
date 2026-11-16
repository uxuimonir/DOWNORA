import { describe, expect, it, vi } from 'vitest';
import { partialOf, runTransfer, TransferError } from './transfer';

function bodyOf(parts: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const size of parts) controller.enqueue(new Uint8Array(size).fill(7));
      controller.close();
    },
  });
}

function mockFetch(make: (init?: RequestInit) => Response) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => make(init)) as unknown as typeof fetch;
}

const base = { url: 'https://cdn.example/a.mp4', maxBytes: 10_000, onProgress: () => {} };

describe('runTransfer', () => {
  it('streams every byte and reports the real total', async () => {
    const progress: number[] = [];
    let clock = 0;
    const result = await runTransfer({
      ...base,
      signal: new AbortController().signal,
      now: () => (clock += 200),
      onProgress: (p) => progress.push(p.bytesReceived),
      fetchImpl: mockFetch(() => new Response(bodyOf([100, 200, 300]), { headers: { 'content-length': '600' } })),
    });
    expect(result.bytesReceived).toBe(600);
    expect(result.bytesTotal).toBe(600);
    expect(result.chunks).toHaveLength(3);
    expect(progress.at(-1)).toBe(600);
  });

  it('resumes from an offset when the server answers 206', async () => {
    const fetchImpl = mockFetch(
      () =>
        new Response(bodyOf([400]), {
          status: 206,
          headers: { 'content-range': 'bytes 200-599/600', 'content-length': '400' },
        }),
    );
    const result = await runTransfer({
      ...base,
      signal: new AbortController().signal,
      existing: [new Uint8Array(200)],
      existingBytes: 200,
      fetchImpl,
    });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Range).toBe('bytes=200-');
    expect(result.resumedFromOffset).toBe(true);
    expect(result.bytesReceived).toBe(600);
    expect(result.chunks).toHaveLength(2);
  });

  it('starts over when the server ignores the Range header', async () => {
    const result = await runTransfer({
      ...base,
      signal: new AbortController().signal,
      existing: [new Uint8Array(200)],
      existingBytes: 200,
      fetchImpl: mockFetch(() => new Response(bodyOf([600]), { headers: { 'content-length': '600' } })),
    });
    expect(result.resumedFromOffset).toBe(false);
    expect(result.bytesReceived).toBe(600);
    expect(result.chunks).toHaveLength(1);
  });

  it('rejects files over the size limit before reading them', async () => {
    await expect(
      runTransfer({
        ...base,
        maxBytes: 100,
        signal: new AbortController().signal,
        fetchImpl: mockFetch(() => new Response(bodyOf([600]), { headers: { 'content-length': '600' } })),
      }),
    ).rejects.toMatchObject({ code: 'too_large' });
  });

  it('reports HTTP errors', async () => {
    await expect(
      runTransfer({
        ...base,
        signal: new AbortController().signal,
        fetchImpl: mockFetch(() => new Response('nope', { status: 404 })),
      }),
    ).rejects.toBeInstanceOf(TransferError);
  });

  it('flags truncated bodies as incomplete', async () => {
    await expect(
      runTransfer({
        ...base,
        signal: new AbortController().signal,
        fetchImpl: mockFetch(() => new Response(bodyOf([100]), { headers: { 'content-length': '600' } })),
      }),
    ).rejects.toMatchObject({ code: 'incomplete' });
  });

  it('keeps the bytes that arrived when the stream errors mid-way', async () => {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (!sent) {
          sent = true;
          c.enqueue(new Uint8Array(250));
        } else {
          c.error(new Error('socket hang up'));
        }
      },
    });
    const error = await runTransfer({
      ...base,
      signal: new AbortController().signal,
      fetchImpl: mockFetch(
        () => new Response(stream, { headers: { 'content-length': '600', 'accept-ranges': 'bytes' } }),
      ),
    }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'network' });
    expect(partialOf(error)).toMatchObject({ bytesReceived: 250, acceptsRanges: true });
  });
});
