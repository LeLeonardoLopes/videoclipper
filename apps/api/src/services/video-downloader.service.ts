import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { platform } from 'node:os';
import type { VideoMetadata } from '@videoclipper/shared';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { VideoDownloadError, VideoInvalidUrlError } from '../errors/video-download.error.js';
import { extractYouTubeVideoId } from '../config/constants.js';

// On Windows yt-dlp is resolved via the shell (PATHEXT). This is only safe because
// every URL passed to spawn() below is a canonical URL rebuilt from a validated
// 11-char video id ([a-zA-Z0-9_-]) — it can never contain shell metacharacters.
const SPAWN_OPTIONS = platform() === 'win32' ? { shell: true } : {};

interface DownloadResult {
  readonly videoPath: string;
  readonly metadata: VideoMetadata;
}

export class VideoDownloaderService {
  async download(videoUrl: string, tempDir: string, onProgress?: (percent: number) => void): Promise<DownloadResult> {
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) {
      throw new VideoInvalidUrlError(videoUrl);
    }

    // Rebuild a canonical URL from the validated id so that only a fixed-alphabet
    // string ever reaches the yt-dlp subprocess (defense against command injection).
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const metadata = await this.fetchMetadata(canonicalUrl);
    const videoPath = await this.downloadVideo(canonicalUrl, tempDir, onProgress);

    return { videoPath, metadata };
  }

  private async fetchMetadata(videoUrl: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const proc = spawn(env.YTDLP_PATH, ['--dump-json', '--no-download', videoUrl], SPAWN_OPTIONS);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr, videoUrl }, 'yt-dlp metadata extraction failed');
          reject(new VideoDownloadError(`yt-dlp metadata extraction failed with code ${code}`, { stderr }));
          return;
        }
        try {
          const json = JSON.parse(stdout) as Record<string, unknown>;
          resolve({
            title: (json.title as string) ?? 'Unknown',
            channel: (json.channel as string) ?? (json.uploader as string) ?? 'Unknown',
            durationSeconds: (json.duration as number) ?? 0,
            thumbnailUrl: (json.thumbnail as string) ?? '',
          });
        } catch (error) {
          reject(new VideoDownloadError('Failed to parse yt-dlp metadata', { error: String(error) }));
        }
      });
    });
  }

  private async downloadVideo(videoUrl: string, tempDir: string, onProgress?: (percent: number) => void): Promise<string> {
    const outputPath = join(tempDir, 'video.mp4');

    return new Promise((resolve, reject) => {
      const args = [
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', outputPath,
        '--newline',
        videoUrl,
      ];

      logger.info({ args: [env.YTDLP_PATH, ...args] }, 'Starting yt-dlp download');
      const proc = spawn(env.YTDLP_PATH, args, SPAWN_OPTIONS);
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        const line = chunk.toString();
        const match = line.match(/(\d+\.?\d*)%/);
        if (match?.[1] && onProgress) {
          onProgress(parseFloat(match[1]));
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr, videoUrl }, 'yt-dlp download failed');
          reject(new VideoDownloadError(`yt-dlp download failed with code ${code}`, { stderr }));
          return;
        }
        logger.info({ outputPath }, 'Video download completed');
        resolve(outputPath);
      });
    });
  }
}
