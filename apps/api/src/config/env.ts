import { config } from 'dotenv';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { z } from 'zod';

// Load .env from monorepo root
config({ path: resolve(import.meta.dirname, '../../../../.env') });

const DEFAULT_TEMP_DIR = join(tmpdir(), 'videoclipper');

const envSchema = z.object({
  WHISPER_API_URL: z.string().url().default('http://localhost:9000'),
  WHISPER_LANGUAGE: z.string().default('pt'),
  WHISPER_SERVER_PATH: z.string().default(''),
  WHISPER_MODEL_PATH: z.string().default(''),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-2.0-flash'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TEMP_DIR: z.string().default(DEFAULT_TEMP_DIR),
  OUTPUT_DIR: z.string().default('./output'),
  FFMPEG_CONCURRENCY: z.coerce.number().default(2),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  YTDLP_PATH: z.string().default('yt-dlp'),
  // Comma-separated allowlist of origins permitted by CORS. Defaults to the Vite dev server.
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
