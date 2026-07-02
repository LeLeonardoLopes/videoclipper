import { PipelinePhase } from '@videoclipper/shared';
import type { SuggestedClip, WhisperResponse, ClipResult } from '@videoclipper/shared';
import type { PipelinePhaseHandler } from './phase.interface.js';
import type { ProgressEmitter } from '../progress-emitter.js';
import { FFmpegService } from '../../services/ffmpeg.service.js';
import { SrtGeneratorService } from '../../services/srt-generator.service.js';
import { CopyGeneratorService } from '../../services/copy-generator.service.js';
import { join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

interface EditingInput {
  readonly videoPath: string;
  readonly whisperResponse: WhisperResponse;
  readonly suggestedClips: ReadonlyArray<SuggestedClip>;
  readonly outputDir: string;
  readonly jobId: string;
}

interface EditingOutput {
  readonly clipResults: ClipResult[];
}

export class EditingExportPhase implements PipelinePhaseHandler<EditingInput, EditingOutput> {
  readonly name = PipelinePhase.EDITING_EXPORT;
  private readonly ffmpeg = new FFmpegService();
  private readonly srtGen = new SrtGeneratorService();
  private readonly copyGen = new CopyGeneratorService();

  async execute(input: EditingInput, emitter: ProgressEmitter): Promise<EditingOutput> {
    emitter.emitProgress(this.name, 'started', 0, 'Iniciando edição dos cortes...');

    const clipsDir = resolve(input.outputDir, input.jobId);
    const srtDir = resolve(clipsDir, 'srt');
    await mkdir(clipsDir, { recursive: true });
    await mkdir(srtDir, { recursive: true });

    // Generate SRT files first (needed for subtitle burn-in)
    for (let i = 0; i < input.suggestedClips.length; i++) {
      const clip = input.suggestedClips[i]!;
      const srtPath = join(srtDir, `clip_${i}.srt`);
      await this.srtGen.generate(input.whisperResponse, clip.startSeconds, clip.endSeconds, srtPath);
    }

    emitter.emitProgress(this.name, 'progress', 10, 'Legendas geradas. Editando os cortes...');

    // Track per-clip progress to compute a monotonic overall value
    const clipProgresses = new Array<number>(input.suggestedClips.length).fill(0);
    let lastEmitted = 10;

    // Process video clips with FFmpeg
    const ffmpegResults = await this.ffmpeg.processClips(
      input.videoPath,
      srtDir,
      input.suggestedClips,
      clipsDir,
      (clipIndex, percent) => {
        clipProgresses[clipIndex] = percent;
        const avgProgress = clipProgresses.reduce((a, b) => a + b, 0) / clipProgresses.length;
        const clipProgress = 10 + (avgProgress / 100) * 80;
        // Never go backwards
        if (clipProgress > lastEmitted) {
          lastEmitted = clipProgress;
          const completed = clipProgresses.filter((p) => p >= 100).length;
          emitter.emitProgress(
            this.name,
            'progress',
            clipProgress,
            `Editando cortes... ${completed}/${input.suggestedClips.length} prontos`,
          );
        }
      },
    );

    // Generate copy.txt files and build results
    const clipResults: ClipResult[] = [];

    for (let i = 0; i < input.suggestedClips.length; i++) {
      const clip = input.suggestedClips[i]!;
      const ffResult = ffmpegResults[i]!;

      if (!ffResult.success) continue;

      const clipId = randomUUID();
      const copyPath = join(clipsDir, `clip_${i}_copy.txt`);
      await this.copyGen.generate(clip, copyPath);

      clipResults.push({
        clipId,
        index: i,
        startSeconds: clip.startSeconds,
        endSeconds: clip.endSeconds,
        durationSeconds: clip.endSeconds - clip.startSeconds,
        seoTitle: clip.seoTitle,
        description: clip.description,
        hashtags: clip.hashtags,
        whyChosen: clip.whyChosen,
        thumbnailUrl: `/api/jobs/${input.jobId}/clips/${i}/download/thumbnail`,
        videoUrl: `/api/jobs/${input.jobId}/clips/${i}/download/video`,
        copyUrl: `/api/jobs/${input.jobId}/clips/${i}/download/copy`,
        srtUrl: `/api/jobs/${input.jobId}/clips/${i}/download/srt`,
      });
    }

    emitter.emitProgress(this.name, 'completed', 100, `${clipResults.length} cortes exportados com sucesso!`);
    return { clipResults };
  }
}
