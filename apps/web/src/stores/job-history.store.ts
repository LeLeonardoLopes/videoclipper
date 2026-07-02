import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HistoryEntry {
  jobId: string;
  videoUrl: string;
  title: string;
  clipCount: number;
  createdAt: string;
  status: string;
}

interface JobHistoryState {
  entries: HistoryEntry[];
  addEntry: (entry: HistoryEntry) => void;
  removeEntry: (jobId: string) => void;
}

export const useJobHistoryStore = create<JobHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => ({
          entries: [entry, ...state.entries].slice(0, 20), // Keep last 20
        })),
      removeEntry: (jobId) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.jobId !== jobId),
        })),
    }),
    { name: 'videoclipper-history' },
  ),
);
