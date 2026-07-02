import type { WhisperResponse } from './whisper.contract.js';
import type { SuggestedClip } from './clip.contract.js';

export interface GeminiAnalysisRequest {
  readonly videoTitle: string;
  readonly channelName: string;
  readonly transcription: WhisperResponse;
  readonly videoDurationSeconds: number;
}

export interface GeminiAnalysisResponse {
  readonly suggestedClips: ReadonlyArray<SuggestedClip>;
  readonly overallAnalysis: string;
}
