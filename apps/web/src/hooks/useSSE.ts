import { useEffect, useRef, useState } from 'react';
import type { ProgressEvent } from '@/types';
import { createSSEConnection } from '@/services/sse.client';

interface UseSSEReturn {
  lastEvent: ProgressEvent | null;
  isConnected: boolean;
  error: string | null;
}

export function useSSE(jobId: string | null): UseSSEReturn {
  const [lastEvent, setLastEvent] = useState<ProgressEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const source = createSSEConnection(
      jobId,
      (event) => {
        setLastEvent(event);
        setIsConnected(true);
      },
      () => {
        setError('Conexão perdida. Tentando reconectar...');
        setIsConnected(false);
      },
    );

    sourceRef.current = source;
    source.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [jobId]);

  return { lastEvent, isConnected, error };
}
