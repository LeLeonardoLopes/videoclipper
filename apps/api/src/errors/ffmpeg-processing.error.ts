import { ErrorCode } from '@videoclipper/shared';
import { AppError } from './base.error.js';

export class FFmpegProcessingError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.FFMPEG_PROCESSING_FAILED, message, 500, details);
  }
}
