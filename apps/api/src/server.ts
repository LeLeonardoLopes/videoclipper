import Fastify from 'fastify';
import cors from '@fastify/cors';
import { logger } from './utils/logger.js';
import { registerRoutes } from './routes/index.js';
import { env } from './config/env.js';
import type { ProgressEmitter } from './pipeline/progress-emitter.js';

export async function buildServer() {
  const server = Fastify({
    logger: false, // We use our own pino instance
  });

  const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await server.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  });

  // Decorate with job emitters map
  server.decorate('jobEmitters', new Map<string, ProgressEmitter>());

  // Register all routes
  await registerRoutes(server);

  // Global error handler
  server.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    logger.error({ error }, 'Unhandled error');
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.name,
      message: error.message,
      statusCode,
    });
  });

  return server;
}
