import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../config/env.js';

export async function createJobTempDir(jobId: string): Promise<string> {
  const dir = join(env.TEMP_DIR, jobId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeJobTempDir(jobId: string): Promise<void> {
  const dir = join(env.TEMP_DIR, jobId);
  await rm(dir, { recursive: true, force: true });
}
