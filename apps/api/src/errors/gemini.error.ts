import { ErrorCode } from '@videoclipper/shared';
import { AppError } from './base.error.js';

export class GeminiAnalysisError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.GEMINI_ANALYSIS_FAILED, message, 502, details);
  }
}
