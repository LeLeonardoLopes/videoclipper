import { create } from 'zustand';
import type { ProgressEvent, ClipResult, VideoMetadata } from '@/types';
import { JobStatus } from '@/types';

interface PipelineState {
  jobId: string | null;
  status: string;
  currentPhase: string | null;
  phasePercentage: number;
  overallPercentage: number;
  message: string;
  videoMetadata: VideoMetadata | null;
  clips: ClipResult[];
  error: string | null;

  setJobId: (id: string) => void;
  updateProgress: (event: ProgressEvent) => void;
  setResult: (metadata: VideoMetadata | null, clips: ClipResult[]) => void;
  setError: (error: string) => void;
  reset: () => void;
}

const initialState = {
  jobId: null,
  status: JobStatus.QUEUED,
  currentPhase: null,
  phasePercentage: 0,
  overallPercentage: 0,
  message: 'Preparando...',
  videoMetadata: null,
  clips: [],
  error: null,
};

export const usePipelineStore = create<PipelineState>((set) => ({
  ...initialState,

  setJobId: (id) => set({ jobId: id, status: JobStatus.PROCESSING }),

  updateProgress: (event) => {
    let status: string = JobStatus.PROCESSING;
    if (event.status === 'failed') {
      status = JobStatus.FAILED;
    } else if (event.status === 'completed' && event.overallPercentage >= 100) {
      status = JobStatus.COMPLETED;
    }

    set({
      currentPhase: event.phase,
      phasePercentage: event.percentage,
      overallPercentage: event.overallPercentage,
      message: event.message,
      status,
      error: event.status === 'failed' ? event.message : null,
    });
  },

  setResult: (metadata, clips) =>
    set({
      status: JobStatus.COMPLETED,
      videoMetadata: metadata,
      clips,
      overallPercentage: 100,
    }),

  setError: (error) => set({ status: JobStatus.FAILED, error }),

  reset: () => set(initialState),
}));
