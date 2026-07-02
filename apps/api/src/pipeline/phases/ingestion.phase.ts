import { PipelinePhase } from '@videoclipper/shared';
import type { VideoMetadata } from '@videoclipper/shared';
import type { PipelinePhaseHandler } from './phase.interface.js';
import type { ProgressEmitter } from '../progress-emitter.js';
import { VideoDownloaderService } from '../../services/video-downloader.service.js';

interface IngestionInput {
  readonly videoUrl: string;
  readonly tempDir: string;
}

interface IngestionOutput {
  readonly videoPath: string;
  readonly metadata: VideoMetadata;
}

export class IngestionPhase implements PipelinePhaseHandler<IngestionInput, IngestionOutput> {
  readonly name = PipelinePhase.INGESTION;
  private readonly downloader = new VideoDownloaderService();

  async execute(input: IngestionInput, emitter: ProgressEmitter): Promise<IngestionOutput> {
    emitter.emitProgress(this.name, 'started', 0, 'Iniciando download do vídeo...');

    const result = await this.downloader.download(input.videoUrl, input.tempDir, (percent) => {
      emitter.emitProgress(this.name, 'progress', percent, `Baixando vídeo... ${Math.round(percent)}%`);
    });

    emitter.emitProgress(this.name, 'completed', 100, 'Download concluído!');
    return result;
  }
}
