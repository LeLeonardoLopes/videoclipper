import type { JobStatus } from '../enums/job-status.enum.js';
import type { ClipResult } from './clip.contract.js';

export interface CreateJobRequest {
  readonly videoUrl: string;
}

export interface CreateJobResponse {
  readonly jobId: string;
  readonly status: JobStatus;
  readonly createdAt: string;
}

export interface JobResult {
  readonly jobId: string;
  readonly status: JobStatus;
  readonly videoMetadata: VideoMetadata | null;
  readonly clips: ReadonlyArray<ClipResult>;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
}

export interface VideoMetadata {
  readonly title: string;
  readonly channel: string;
  readonly durationSeconds: number;
  readonly thumbnailUrl: string;
}
