import { EventEmitter } from 'node:events';
import { PipelinePhase, PHASE_WEIGHTS, type ProgressEvent, type ProgressStatus } from '@videoclipper/shared';
import { logger } from '../utils/logger.js';

export class ProgressEmitter extends EventEmitter {
  private readonly completedPhases = new Set<PipelinePhase>();
  private readonly buffer: ProgressEvent[] = [];
  private lastOverall = 0;

  constructor(private jobId: string) {
    super();
  }

  updateJobId(jobId: string): void {
    this.jobId = jobId;
  }

  replayTo(listener: (event: ProgressEvent) => void): void {
    for (const event of this.buffer) {
      listener(event);
    }
  }

  emit(event: 'progress', data: ProgressEvent): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  emitProgress(phase: PipelinePhase, status: ProgressStatus, percentage: number, message: string): void {
    if (status === 'completed') {
      this.completedPhases.add(phase);
    }

    const calculated = this.calculateOverallPercentage(phase, percentage);
    // Never let overall go backwards (except on failure)
    if (status !== 'failed') {
      this.lastOverall = Math.max(this.lastOverall, calculated);
    }
    const overallPercentage = status === 'failed' ? calculated : this.lastOverall;

    const event: ProgressEvent = {
      jobId: this.jobId,
      phase,
      status,
      percentage: Math.round(percentage),
      overallPercentage: Math.round(overallPercentage),
      message,
      timestamp: new Date().toISOString(),
    };

    this.buffer.push(event);
    logger.debug({ event }, 'Pipeline progress');
    this.emit('progress', event);
  }

  private calculateOverallPercentage(currentPhase: PipelinePhase, currentPhasePercentage: number): number {
    const phases = Object.values(PipelinePhase).filter((p) => p !== PipelinePhase.CLEANUP);
    let overall = 0;

    for (const phase of phases) {
      const weight = PHASE_WEIGHTS[phase];
      if (this.completedPhases.has(phase)) {
        overall += weight;
      } else if (phase === currentPhase) {
        overall += (weight * currentPhasePercentage) / 100;
      }
    }

    return Math.min(overall, 100);
  }
}
