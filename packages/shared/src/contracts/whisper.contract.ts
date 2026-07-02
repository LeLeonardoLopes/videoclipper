export interface WhisperResponse {
  readonly text: string;
  readonly segments: ReadonlyArray<WhisperSegment>;
  readonly language: string;
}

export interface WhisperSegment {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly words: ReadonlyArray<WhisperWord>;
}

export interface WhisperWord {
  readonly word: string;
  readonly start: number;
  readonly end: number;
  readonly probability: number;
}
