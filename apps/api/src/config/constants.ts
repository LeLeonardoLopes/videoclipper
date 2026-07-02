// Fully anchored (^...$) and capturing the 11-char video id. Anchoring the end
// is a security control: it forbids trailing shell metacharacters from reaching yt-dlp.
export const YOUTUBE_URL_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&#][A-Za-z0-9_%=&.-]*)?$/;

/**
 * Extracts and validates the 11-char YouTube video id from a URL.
 * Returns null if the URL is not a well-formed YouTube watch/short link.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const match = YOUTUBE_URL_REGEX.exec(url);
  return match?.[1] ?? null;
}
export const MAX_VIDEO_DURATION_SECONDS = 3600; // 1 hour
export const CLIP_MIN_DURATION_SECONDS = 15;
export const CLIP_MAX_DURATION_SECONDS = 90;
export const WHISPER_TIMEOUT_MS = 300_000; // 5 minutes
export const GEMINI_TIMEOUT_MS = 60_000; // 1 minute
