import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { env } from '../config/env.js';

const FILE_MAP: Record<string, { filename: (idx: number) => string; contentType: string }> = {
  video: { filename: (idx) => `clip_${idx}.mp4`, contentType: 'video/mp4' },
  copy: { filename: (idx) => `clip_${idx}_copy.txt`, contentType: 'text/plain; charset=utf-8' },
  srt: { filename: (idx) => `clip_${idx}.srt`, contentType: 'application/x-subrip' },
  thumbnail: { filename: (idx) => `clip_${idx}_thumb.jpg`, contentType: 'image/jpeg' },
};

// Strict validation of path-derived params: a UUID has no path separators or dots,
// and clipIndex is bounded — so the built filename can never escape OUTPUT_DIR.
const paramsSchema = z.object({
  jobId: z.string().uuid(),
  clipIndex: z.coerce.number().int().nonnegative().max(999),
  fileType: z.enum(['video', 'copy', 'srt', 'thumbnail']),
});

export async function clipsRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/jobs/:jobId/clips/:clipIndex/download/:fileType',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request parameters' });
      }
      const { jobId, clipIndex, fileType } = parsed.data;
      const mapping = FILE_MAP[fileType];
      if (!mapping) {
        return reply.status(400).send({ error: 'Invalid request parameters' });
      }

      const outputRoot = resolve(env.OUTPUT_DIR);
      const jobDir = resolve(outputRoot, jobId);
      const subDir = fileType === 'srt' ? join(jobDir, 'srt') : jobDir;
      const filePath = resolve(subDir, mapping.filename(clipIndex));

      // Defense in depth: reject anything that resolves outside OUTPUT_DIR.
      if (filePath !== jobDir && !filePath.startsWith(jobDir + sep)) {
        return reply.status(400).send({ error: 'Invalid request parameters' });
      }

      try {
        const fileStat = await stat(filePath);

        reply.header('Content-Type', mapping.contentType);
        reply.header('Content-Length', fileStat.size);
        const disposition = fileType === 'thumbnail' ? 'inline' : `attachment; filename="${mapping.filename(clipIndex)}"`;
        reply.header('Content-Disposition', disposition);

        return reply.send(createReadStream(filePath));
      } catch {
        return reply.status(404).send({ error: 'File not found', filePath: `${jobId}/clip_${clipIndex}` });
      }
    },
  );
}
