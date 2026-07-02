import { writeFile } from 'node:fs/promises';
import type { WhisperResponse, WhisperWord } from '@videoclipper/shared';
import { logger } from '../utils/logger.js';

const WORDS_PER_GROUP = 7;

export class SrtGeneratorService {
  async generate(
    whisper: WhisperResponse,
    startSeconds: number,
    endSeconds: number,
    outputPath: string,
  ): Promise<void> {
    // Collect all words within the clip range
    const clipWords: WhisperWord[] = [];
    for (const segment of whisper.segments) {
      if (segment.end <= startSeconds || segment.start >= endSeconds) continue;
      for (const word of segment.words) {
        if (word.end > startSeconds && word.start < endSeconds) {
          clipWords.push(word);
        }
      }
    }

    // Fall back to segment-level if no words available
    if (clipWords.length === 0) {
      const srtLines = this.generateFromSegments(whisper, startSeconds, endSeconds);
      await writeFile(outputPath, srtLines, 'utf-8');
      logger.debug({ outputPath, mode: 'segment-fallback' }, 'SRT file generated');
      return;
    }

    // Group words into subtitle blocks
    const srtLines: string[] = [];
    let index = 1;
    const clipDuration = endSeconds - startSeconds;

    for (let i = 0; i < clipWords.length; i += WORDS_PER_GROUP) {
      const group = clipWords.slice(i, i + WORDS_PER_GROUP);
      const firstWord = group[0]!;
      const lastWord = group[group.length - 1]!;

      const adjustedStart = Math.max(firstWord.start - startSeconds, 0);
      const adjustedEnd = Math.min(lastWord.end - startSeconds, clipDuration);
      const text = group.map((w) => w.word).join(' ').trim();

      if (text) {
        srtLines.push(
          String(index),
          `${this.formatSrtTime(adjustedStart)} --> ${this.formatSrtTime(adjustedEnd)}`,
          text,
          '',
        );
        index++;
      }
    }

    await writeFile(outputPath, srtLines.join('\n'), 'utf-8');
    logger.debug({ outputPath, wordCount: clipWords.length, subtitleBlocks: index - 1 }, 'SRT file generated (word-level)');
  }

  private generateFromSegments(whisper: WhisperResponse, startSeconds: number, endSeconds: number): string {
    const segments = whisper.segments.filter(
      (s) => s.end > startSeconds && s.start < endSeconds,
    );
    const clipDuration = endSeconds - startSeconds;
    const srtLines: string[] = [];
    let index = 1;

    for (const segment of segments) {
      const adjustedStart = Math.max(segment.start - startSeconds, 0);
      const adjustedEnd = Math.min(segment.end - startSeconds, clipDuration);

      srtLines.push(
        String(index),
        `${this.formatSrtTime(adjustedStart)} --> ${this.formatSrtTime(adjustedEnd)}`,
        segment.text.trim(),
        '',
      );
      index++;
    }

    return srtLines.join('\n');
  }

  private formatSrtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
}
