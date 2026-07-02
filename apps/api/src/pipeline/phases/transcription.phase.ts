import { PipelinePhase } from '@videoclipper/shared';
import type { WhisperResponse } from '@videoclipper/shared';
import type { PipelinePhaseHandler } from './phase.interface.js';
import type { ProgressEmitter } from '../progress-emitter.js';
import { WhisperService } from '../../services/whisper.service.js';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { platform } from 'node:os';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

interface TranscriptionInput {
  readonly videoPath: string;
}

interface TranscriptionOutput {
  readonly whisperResponse: WhisperResponse;
}

export class TranscriptionPhase implements PipelinePhaseHandler<TranscriptionInput, TranscriptionOutput> {
  readonly name = PipelinePhase.TRANSCRIPTION;
  private readonly whisper = new WhisperService();

  async execute(input: TranscriptionInput, emitter: ProgressEmitter): Promise<TranscriptionOutput> {
    emitter.emitProgress(this.name, 'started', 0, 'Extraindo áudio do vídeo...');

    const audioPath = await this.extractAudio(input.videoPath);

    emitter.emitProgress(this.name, 'progress', 20, 'Áudio extraído. Iniciando transcrição...');
    emitter.emitProgress(this.name, 'progress', 30, 'Transcrevendo o conteúdo do vídeo...');

    const whisperResponse = await this.whisper.transcribe(audioPath);

    emitter.emitProgress(this.name, 'completed', 100, `Transcrição concluída! ${whisperResponse.segments.length} segmentos identificados.`);
    return { whisperResponse };
  }

  private extractAudio(videoPath: string): Promise<string> {
    const audioPath = join(dirname(videoPath), 'audio.wav');
    const spawnOpts = platform() === 'win32' ? { shell: true as const } : {};

    return new Promise((resolve, reject) => {
      const proc = spawn(env.FFMPEG_PATH, [
        '-i', videoPath,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y',
        audioPath,
      ], spawnOpts);

      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr: stderr.slice(-500) }, 'Audio extraction failed');
          reject(new Error(`FFmpeg audio extraction failed with code ${code}`));
          return;
        }
        logger.info({ audioPath }, 'Audio extracted successfully');
        resolve(audioPath);
      });
    });
  }
}
