import { PipelinePhase } from '@videoclipper/shared';
import type { VideoMetadata, WhisperResponse, GeminiAnalysisResponse } from '@videoclipper/shared';
import type { PipelinePhaseHandler } from './phase.interface.js';
import type { ProgressEmitter } from '../progress-emitter.js';
import { GeminiService } from '../../services/gemini.service.js';

interface ViralityInput {
  readonly metadata: VideoMetadata;
  readonly whisperResponse: WhisperResponse;
}

interface ViralityOutput {
  readonly analysis: GeminiAnalysisResponse;
}

export class ViralityAnalysisPhase implements PipelinePhaseHandler<ViralityInput, ViralityOutput> {
  readonly name = PipelinePhase.VIRALITY_ANALYSIS;
  private readonly gemini = new GeminiService();

  async execute(input: ViralityInput, emitter: ProgressEmitter): Promise<ViralityOutput> {
    emitter.emitProgress(this.name, 'started', 0, 'Iniciando análise do conteúdo...');

    // Simulated progress while waiting for AI response
    const progressInterval = setInterval(() => {
      const current = this.simulatedProgress;
      if (current < 85) {
        this.simulatedProgress = Math.min(current + 5, 85);
        emitter.emitProgress(this.name, 'progress', this.simulatedProgress, 'Em análise...');
      }
    }, 2000);

    try {
      const analysis = await this.gemini.analyze({
        videoTitle: input.metadata.title,
        channelName: input.metadata.channel,
        transcription: input.whisperResponse,
        videoDurationSeconds: input.metadata.durationSeconds,
      });

      clearInterval(progressInterval);
      emitter.emitProgress(this.name, 'completed', 100, `Análise concluída! ${analysis.suggestedClips.length} cortes identificados.`);
      return { analysis };
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  private simulatedProgress = 0;
}
