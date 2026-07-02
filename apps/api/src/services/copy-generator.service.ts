import { writeFile } from 'node:fs/promises';
import type { SuggestedClip } from '@videoclipper/shared';
import { logger } from '../utils/logger.js';

export class CopyGeneratorService {
  async generate(clip: SuggestedClip, outputPath: string): Promise<void> {
    const content = [
      `TITULO`,
      clip.seoTitle,
      '',
      `LEGENDA`,
      clip.description,
      '',
      `HASHTAGS`,
      clip.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '),
      '',
      `POR QUE ESTE CORTE?`,
      clip.whyChosen,
      '',
      `PALAVRAS-CHAVE`,
      clip.keywords.join(', '),
    ].join('\n');

    await writeFile(outputPath, content, 'utf-8');
    logger.debug({ outputPath }, 'Copy file generated');
  }
}
