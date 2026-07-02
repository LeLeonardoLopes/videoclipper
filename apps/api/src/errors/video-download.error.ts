import { ErrorCode } from '@videoclipper/shared';
import { AppError } from './base.error.js';

export class VideoDownloadError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.VIDEO_DOWNLOAD_FAILED, message, 502, details);
  }
}

export class VideoInvalidUrlError extends AppError {
  constructor(url: string) {
    super(ErrorCode.VIDEO_INVALID_URL, `Invalid YouTube URL: ${url}`, 400, { url });
  }
}
