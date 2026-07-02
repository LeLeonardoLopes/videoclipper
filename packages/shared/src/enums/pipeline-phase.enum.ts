export const PipelinePhase = {
  INGESTION: 'INGESTION',
  TRANSCRIPTION: 'TRANSCRIPTION',
  VIRALITY_ANALYSIS: 'VIRALITY_ANALYSIS',
  EDITING_EXPORT: 'EDITING_EXPORT',
  CLEANUP: 'CLEANUP',
} as const;

export type PipelinePhase = (typeof PipelinePhase)[keyof typeof PipelinePhase];

export const PHASE_WEIGHTS: Record<PipelinePhase, number> = {
  [PipelinePhase.INGESTION]: 15,
  [PipelinePhase.TRANSCRIPTION]: 20,
  [PipelinePhase.VIRALITY_ANALYSIS]: 15,
  [PipelinePhase.EDITING_EXPORT]: 50,
  [PipelinePhase.CLEANUP]: 0,
};
