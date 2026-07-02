import { ErrorCode } from '@videoclipper/shared';
import { AppError } from './base.error.js';

export class TranscriptionError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.TRANSCRIPTION_FAILED, message, 502, details);
  }
}

export class TranscriptionTimeoutError extends AppError {
  constructor(timeoutMs: number) {
    super(ErrorCode.TRANSCRIPTION_TIMEOUT, `Transcription timed out after ${timeoutMs}ms`, 504, { timeoutMs });
  }
}
