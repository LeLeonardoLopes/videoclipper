import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PipelineOrchestrator } from '../pipeline/pipeline-orchestrator.js';
import { ProgressEmitter } from '../pipeline/progress-emitter.js';
import { YOUTUBE_URL_REGEX } from '../config/constants.js';
import type { ProgressEvent, CreateJobResponse } from '@videoclipper/shared';
import { JobStatus } from '@videoclipper/shared';

const orchestrator = new PipelineOrchestrator();

const createJobSchema = z.object({
  videoUrl: z.string().regex(YOUTUBE_URL_REGEX, 'Invalid YouTube URL'),
});

export async function jobsRoutes(server: FastifyInstance): Promise<void> {
  // POST /api/jobs — Create a new clipping job
  server.post('/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation error',
        message: parsed.error.errors.map((e) => e.message).join(', '),
        statusCode: 400,
      });
    }
    const body = parsed.data;

    const emitter = new ProgressEmitter('pending');
    const jobId = await orchestrator.startJob(body.videoUrl, emitter);

    // Update emitter with real jobId so SSE events carry correct id
    emitter.updateJobId(jobId);

    // Register emitter so SSE endpoint can find it
    server.jobEmitters.set(jobId, emitter);

    const response: CreateJobResponse = {
      jobId,
      status: JobStatus.QUEUED,
      createdAt: new Date().toISOString(),
    };

    return reply.status(201).send(response);
  });

  // GET /api/jobs/:id — Get job status and results
  server.get('/jobs/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const job = orchestrator.getJob(id);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found', jobId: id });
    }

    return reply.send(job);
  });

  // GET /api/jobs/:id/progress — SSE endpoint for real-time progress
  server.get('/jobs/:id/progress', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const emitter = server.jobEmitters.get(id);

    if (!emitter) {
      return reply.status(404).send({ error: 'Job not found or already completed', jobId: id });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const cleanup = (): void => {
      emitter.removeListener('progress', onProgress);
      server.jobEmitters.delete(id);
    };

    const onProgress = (event: ProgressEvent): void => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

      if (
        (event.status === 'completed' && event.overallPercentage >= 100) ||
        event.status === 'failed'
      ) {
        reply.raw.end();
        cleanup();
      }
    };

    // Attach live listener first (no gap — Node.js is single-threaded)
    emitter.on('progress', onProgress);
    // Replay buffered events so the client catches up on missed progress
    emitter.replayTo(onProgress);
    request.raw.on('close', cleanup);
  });
}
