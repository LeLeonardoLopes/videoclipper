import { rm } from 'node:fs/promises';
import { logger } from '../utils/logger.js';

export class CleanupService {
  async deleteRawVideo(tempDir: string): Promise<void> {
    try {
      await rm(tempDir, { recursive: true, force: true });
      logger.info({ tempDir }, 'Raw video and temp files deleted successfully');
    } catch (error) {
      // NEVER throw from cleanup — log and continue
      logger.error({ error, tempDir }, 'Cleanup failed — manual intervention may be needed');
    }
  }
}
