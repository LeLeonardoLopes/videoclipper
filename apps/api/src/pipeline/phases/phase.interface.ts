import type { PipelinePhase } from '@videoclipper/shared';
import type { ProgressEmitter } from '../progress-emitter.js';

export interface PipelinePhaseHandler<TInput, TOutput> {
  readonly name: PipelinePhase;
  execute(input: TInput, emitter: ProgressEmitter): Promise<TOutput>;
}
