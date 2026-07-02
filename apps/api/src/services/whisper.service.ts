import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { WhisperResponse } from '@videoclipper/shared';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { TranscriptionError, TranscriptionTimeoutError } from '../errors/transcription.error.js';
import { WHISPER_TIMEOUT_MS } from '../config/constants.js';

export class WhisperService {
  async transcribe(audioPath: string): Promise<WhisperResponse> {
    logger.info({ audioPath }, 'Starting Whisper transcription');

    return withRetry(
      () => this.sendToWhisper(audioPath),
      'whisper-transcription',
      {
        maxAttempts: 3,
        baseDelayMs: 2000,
        shouldRetry: (error) => !(error instanceof TranscriptionError),
      },
    );
  }

  private async sendToWhisper(audioPath: string): Promise<WhisperResponse> {
    const fileBuffer = await readFile(audioPath);
    const fileName = basename(audioPath);

    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), fileName);
    form.append('language', env.WHISPER_LANGUAGE);
    form.append('response_format', 'verbose_json');
    form.append('word_timestamps', 'true');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);

    try {
      const response = await fetch(`${env.WHISPER_API_URL}/inference`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new TranscriptionError(`Whisper API returned ${response.status}: ${text}`);
      }

      const data = (await response.json()) as WhisperResponse;
      logger.info({ segments: data.segments.length, language: data.language }, 'Transcription completed');
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TranscriptionTimeoutError(WHISPER_TIMEOUT_MS);
      }
      if (error instanceof TypeError && error.message === 'fetch failed') {
        const cause = (error as unknown as Record<string, unknown>).cause as { code?: string } | undefined;
        if (cause?.code === 'ECONNREFUSED') {
          throw new TranscriptionError(
            `Whisper server não encontrado em ${env.WHISPER_API_URL}. Verifique se o servidor está rodando.`,
            { originalError: String(cause) },
          );
        }
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
