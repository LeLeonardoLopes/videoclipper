import type { PipelinePhase } from '../enums/pipeline-phase.enum.js';

export type ProgressStatus = 'started' | 'progress' | 'completed' | 'failed';

export interface ProgressEvent {
  readonly jobId: string;
  readonly phase: PipelinePhase;
  readonly status: ProgressStatus;
  readonly percentage: number;
  readonly overallPercentage: number;
  readonly message: string;
  readonly timestamp: string;
}
