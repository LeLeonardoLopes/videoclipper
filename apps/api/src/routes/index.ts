import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.routes.js';
import { jobsRoutes } from './jobs.routes.js';
import { clipsRoutes } from './clips.routes.js';

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(healthRoutes, { prefix: '/api' });
  await server.register(jobsRoutes, { prefix: '/api' });
  await server.register(clipsRoutes, { prefix: '/api' });
}
