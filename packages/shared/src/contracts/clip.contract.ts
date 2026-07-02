export interface ClipResult {
  readonly clipId: string;
  readonly index: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly durationSeconds: number;
  readonly seoTitle: string;
  readonly description: string;
  readonly hashtags: ReadonlyArray<string>;
  readonly whyChosen: string;
  readonly thumbnailUrl: string;
  readonly videoUrl: string;
  readonly copyUrl: string;
  readonly srtUrl: string;
}

export interface SuggestedClip {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly seoTitle: string;
  readonly description: string;
  readonly hashtags: ReadonlyArray<string>;
  readonly whyChosen: string;
  readonly hookText: string;
  readonly keywords: ReadonlyArray<string>;
}
