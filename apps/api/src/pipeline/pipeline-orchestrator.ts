import { v4 as uuidv4 } from 'uuid';
import { JobStatus, PipelinePhase } from '@videoclipper/shared';
import type { JobResult, ClipResult, VideoMetadata } from '@videoclipper/shared';
import { ProgressEmitter } from './progress-emitter.js';
import { IngestionPhase } from './phases/ingestion.phase.js';
import { TranscriptionPhase } from './phases/transcription.phase.js';
import { ViralityAnalysisPhase } from './phases/virality-analysis.phase.js';
import { EditingExportPhase } from './phases/editing-export.phase.js';
import { CleanupService } from '../services/cleanup.service.js';
import { createJobTempDir } from '../utils/temp-dir.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface JobState {
  readonly jobId: string;
  status: string;
  videoMetadata: VideoMetadata | null;
  clips: ClipResult[];
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

// In-memory job storage (upgrade to DB later)
const jobStore = new Map<string, JobState>();

export class PipelineOrchestrator {
  private readonly ingestion = new IngestionPhase();
  private readonly transcription = new TranscriptionPhase();
  private readonly viralityAnalysis = new ViralityAnalysisPhase();
  private readonly editingExport = new EditingExportPhase();
  private readonly cleanup = new CleanupService();

  async startJob(videoUrl: string, emitter: ProgressEmitter): Promise<string> {
    const jobId = uuidv4();
    const state: JobState = {
      jobId,
      status: JobStatus.PROCESSING,
      videoMetadata: null,
      clips: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };
    jobStore.set(jobId, state);

    // Run pipeline asynchronously
    this.runPipeline(jobId, videoUrl, emitter).catch((error) => {
      logger.error({ error, jobId }, 'Pipeline fatal error');
    });

    return jobId;
  }

  getJob(jobId: string): JobResult | undefined {
    const state = jobStore.get(jobId);
    if (!state) return undefined;
    return { ...state, status: state.status as JobResult['status'] };
  }

  private async runPipeline(jobId: string, videoUrl: string, emitter: ProgressEmitter): Promise<void> {
    const state = jobStore.get(jobId)!;
    let tempDir: string | null = null;

    try {
      // Phase 1: Ingestion
      tempDir = await createJobTempDir(jobId);
      const { videoPath, metadata } = await this.ingestion.execute({ videoUrl, tempDir }, emitter);
      state.videoMetadata = metadata;

      // Phase 2: Transcription
      const { whisperResponse } = await this.transcription.execute({ videoPath }, emitter);

      // Phase 3: Virality Analysis
      const { analysis } = await this.viralityAnalysis.execute({ metadata, whisperResponse }, emitter);

      // Phase 4: Editing & Export
      const { clipResults } = await this.editingExport.execute(
        {
          videoPath,
          whisperResponse,
          suggestedClips: analysis.suggestedClips,
          outputDir: env.OUTPUT_DIR,
          jobId,
        },
        emitter,
      );

      state.clips = clipResults;
      state.status = JobStatus.COMPLETED;
      state.completedAt = new Date().toISOString();

      logger.info({ jobId, clipCount: clipResults.length }, 'Pipeline completed successfully');
    } catch (error) {
      state.status = JobStatus.FAILED;
      state.error = error instanceof Error ? error.message : String(error);
      state.completedAt = new Date().toISOString();

      emitter.emitProgress(PipelinePhase.CLEANUP, 'failed', 0, 'Ocorreu um erro durante o processamento. Tente novamente.');
      logger.error({ error, jobId }, 'Pipeline failed');
    } finally {
      // MANDATORY CLEANUP — always delete raw .mp4
      if (tempDir) {
        emitter.emitProgress(PipelinePhase.CLEANUP, 'started', 0, 'Limpando arquivos temporários...');
        await this.cleanup.deleteRawVideo(tempDir);
        emitter.emitProgress(PipelinePhase.CLEANUP, 'completed', 100, 'Arquivos temporários removidos.');
      }
    }
  }
}
