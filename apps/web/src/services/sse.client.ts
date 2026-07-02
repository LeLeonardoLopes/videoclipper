import type { ProgressEvent } from '@/types';

export function createSSEConnection(
  jobId: string,
  onProgress: (event: ProgressEvent) => void,
  onError?: (error: Event) => void,
): EventSource {
  const source = new EventSource(`/api/jobs/${jobId}/progress`);

  source.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as ProgressEvent;
      onProgress(data);
    } catch {
      // Ignore malformed events
    }
  };

  source.onerror = (error) => {
    onError?.(error);
  };

  return source;
}
