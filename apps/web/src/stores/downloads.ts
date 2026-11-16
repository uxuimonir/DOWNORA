import type { DownloadJob, DownloadStatus } from '@downora/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const ACTIVE_STATUSES: DownloadStatus[] = ['queued', 'downloading', 'paused'];
export const FINISHED_STATUSES: DownloadStatus[] = ['completed', 'failed', 'canceled'];

export function isActive(job: DownloadJob): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

interface DownloadsState {
  /** Newest first. */
  jobs: DownloadJob[];
  add: (job: DownloadJob) => void;
  patch: (id: string, patch: Partial<DownloadJob>) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  trimHistory: (limit: number) => void;
}

export const useDownloads = create<DownloadsState>()(
  persist(
    (set) => ({
      jobs: [],
      add: (job) => set((s) => ({ jobs: [job, ...s.jobs] })),
      patch: (id, patch) =>
        set((s) => ({ jobs: s.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)) })),
      remove: (id) => set((s) => ({ jobs: s.jobs.filter((job) => job.id !== id) })),
      clearFinished: () => set((s) => ({ jobs: s.jobs.filter(isActive) })),
      trimHistory: (limit) =>
        set((s) => {
          let finished = 0;
          return {
            jobs: s.jobs.filter((job) => isActive(job) || ++finished <= limit),
          };
        }),
    }),
    {
      name: 'downora.downloads',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Bytes held in memory are lost on reload, so an unfinished transfer
      // can't silently continue. Say so instead of pretending.
      merge: (persisted, current) => ({
        ...current,
        jobs: ((persisted as Partial<DownloadsState> | undefined)?.jobs ?? []).map((job) =>
          job.status === 'downloading' || job.status === 'paused'
            ? {
                ...job,
                status: 'failed',
                errorCode: 'interrupted',
                errorMessage: 'Downora was closed before this download finished. Retry to start it again.',
                speedBps: undefined,
                etaSec: undefined,
              }
            : job,
        ),
      }),
    },
  ),
);
