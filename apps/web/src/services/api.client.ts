import type { CreateJobRequest, CreateJobResponse, JobResult } from '@/types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error((error as { message: string }).message || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  createJob: (data: CreateJobRequest) =>
    request<CreateJobResponse>('/jobs', { method: 'POST', body: JSON.stringify(data) }),

  getJob: (jobId: string) =>
    request<JobResult>(`/jobs/${jobId}`),
};
