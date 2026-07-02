import { spawn, type ChildProcess } from 'node:child_process';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30000;

class WhisperProcessService {
  private process: ChildProcess | null = null;

  async start(): Promise<void> {
    if (!env.WHISPER_SERVER_PATH) {
      logger.info('WHISPER_SERVER_PATH not set — assuming whisper-server is managed manually');
      return;
    }

    // Check if server is already responding
    if (await this.isServerUp()) {
      logger.info({ url: env.WHISPER_API_URL }, 'Whisper server already running — skipping spawn');
      return;
    }

    const port = this.extractPort(env.WHISPER_API_URL);

    logger.info(
      { execPath: env.WHISPER_SERVER_PATH, model: env.WHISPER_MODEL_PATH, port },
      'Spawning whisper-server process',
    );

    this.process = spawn(
      env.WHISPER_SERVER_PATH,
      ['-m', env.WHISPER_MODEL_PATH, '--port', String(port), '-l', env.WHISPER_LANGUAGE],
      { shell: true },
    );

    this.process.stdout?.on('data', (chunk: Buffer) => {
      logger.info({ source: 'whisper-server' }, chunk.toString().trim());
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      logger.warn({ source: 'whisper-server' }, chunk.toString().trim());
    });

    this.process.on('error', (err) => {
      logger.error({ err }, 'whisper-server process error');
    });

    this.process.on('exit', (code, signal) => {
      logger.info({ code, signal }, 'whisper-server process exited');
      this.process = null;
    });

    const ready = await this.waitUntilReady();
    if (ready) {
      logger.info({ url: env.WHISPER_API_URL }, 'Whisper server is ready');
    } else {
      logger.error({ url: env.WHISPER_API_URL }, 'Whisper server did not become ready within timeout — continuing anyway');
    }
  }

  stop(): void {
    if (this.process) {
      logger.info('Shutting down whisper-server process');
      this.process.kill();
      this.process = null;
    }
  }

  private extractPort(url: string): number {
    try {
      return parseInt(new URL(url).port, 10) || 80;
    } catch {
      return 9000;
    }
  }

  private async isServerUp(): Promise<boolean> {
    try {
      const res = await fetch(`${env.WHISPER_API_URL}/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitUntilReady(): Promise<boolean> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.isServerUp()) return true;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return false;
  }
}

export const whisperProcess = new WhisperProcessService();
