import { ErrorCode } from '@videoclipper/shared';
import { AppError } from './base.error.js';

export class CleanupError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.CLEANUP_FAILED, message, 500, details);
  }
}
