import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { platform } from 'node:os';
import type { SuggestedClip } from '@videoclipper/shared';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { FFmpegProcessingError } from '../errors/ffmpeg-processing.error.js';

const SPAWN_OPTIONS = platform() === 'win32' ? { shell: true } : {};

interface ClipProcessingResult {
  readonly clipIndex: number;
  readonly outputPath: string;
  readonly thumbnailPath: string;
  readonly success: boolean;
  readonly error?: string;
}

export class FFmpegService {
  async processClips(
    videoPath: string,
    srtDir: string,
    clips: ReadonlyArray<SuggestedClip>,
    outputDir: string,
    onProgress?: (clipIndex: number, percent: number) => void,
  ): Promise<ClipProcessingResult[]> {
    logger.info({ clipCount: clips.length, concurrency: env.FFMPEG_CONCURRENCY }, 'Starting FFmpeg clip processing');

    const results: ClipProcessingResult[] = [];

    // Process clips with concurrency limit
    for (let i = 0; i < clips.length; i += env.FFMPEG_CONCURRENCY) {
      const batch = clips.slice(i, i + env.FFMPEG_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((clip, batchIdx) => {
          const clipIndex = i + batchIdx;
          return this.processOneClip(videoPath, clip, clipIndex, srtDir, outputDir, (pct) => onProgress?.(clipIndex, pct));
        }),
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]!;
        const clipIndex = i + j;
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            clipIndex,
            outputPath: '',
            thumbnailPath: '',
            success: false,
            error: String(result.reason),
          });
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    logger.info({ successCount, totalClips: clips.length }, 'FFmpeg processing completed');

    return results;
  }

  private async processOneClip(
    videoPath: string,
    clip: SuggestedClip,
    index: number,
    srtDir: string,
    outputDir: string,
    onProgress?: (percent: number) => void,
  ): Promise<ClipProcessingResult> {
    const outputPath = resolve(outputDir, `clip_${index}.mp4`);
    const duration = clip.endSeconds - clip.startSeconds;
    const srtPath = resolve(srtDir, `clip_${index}.srt`);

    // Build FFmpeg filter chain: crop to 9:16 + subtitles + loudnorm
    const filterComplex = [
      `crop=ih*9/16:ih:(iw-ih*9/16)/2:0`,
      `subtitles='${srtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")}'`,
    ].join(',');

    const args = [
      '-i', videoPath,
      '-ss', String(clip.startSeconds),
      '-t', String(duration),
      '-vf', filterComplex,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      '-progress', 'pipe:1',
      outputPath,
    ];

    logger.debug({ clipIndex: index, args }, 'Spawning FFmpeg');

    const thumbPath = resolve(outputDir, `clip_${index}_thumb.jpg`);

    return new Promise((done, reject) => {
      const proc = spawn(env.FFMPEG_PATH, args, SPAWN_OPTIONS);
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          const match = line.match(/out_time_ms=(\d+)/);
          if (match?.[1] && onProgress) {
            const currentMs = parseInt(match[1], 10) / 1000;
            const percent = Math.min((currentMs / (duration * 1000)) * 100, 100);
            onProgress(percent);
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error({ clipIndex: index, code, stderr: stderr.slice(-500) }, 'FFmpeg clip failed');
          reject(new FFmpegProcessingError(`FFmpeg failed for clip ${index} with code ${code}`, { stderr: stderr.slice(-500) }));
          return;
        }

        this.generateThumbnail(outputPath, thumbPath).then(() => {
          logger.info({ clipIndex: index, outputPath, thumbPath }, 'Clip and thumbnail processed');
          done({ clipIndex: index, outputPath, thumbnailPath: thumbPath, success: true });
        }).catch(() => {
          logger.warn({ clipIndex: index }, 'Thumbnail generation failed, continuing without it');
          done({ clipIndex: index, outputPath, thumbnailPath: '', success: true });
        });
      });
    });
  }

  private generateThumbnail(videoPath: string, thumbOutputPath: string): Promise<void> {
    return new Promise((done, reject) => {
      const proc = spawn(env.FFMPEG_PATH, [
        '-i', videoPath,
        '-ss', '1',
        '-frames:v', '1',
        '-q:v', '2',
        '-y',
        thumbOutputPath,
      ], SPAWN_OPTIONS);

      proc.on('close', (code) => {
        code === 0 ? done() : reject(new Error(`Thumbnail failed with code ${code}`));
      });
    });
  }
}
