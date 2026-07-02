import { useEffect } from 'react';
import { useSSE } from './useSSE';
import { usePipelineStore } from '@/stores/pipeline.store';

export function usePipelineProgress(jobId: string | null) {
  const { lastEvent, isConnected, error: sseError } = useSSE(jobId);
  const store = usePipelineStore();

  useEffect(() => {
    if (lastEvent) {
      store.updateProgress(lastEvent);
    }
  }, [lastEvent]);

  return {
    phase: store.currentPhase,
    phasePercentage: store.phasePercentage,
    overallPercentage: store.overallPercentage,
    message: store.message,
    status: store.status,
    error: store.error || sseError,
    isConnected,
  };
}
