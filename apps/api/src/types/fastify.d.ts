import type { ProgressEmitter } from '../pipeline/progress-emitter.js';

declare module 'fastify' {
  interface FastifyInstance {
    jobEmitters: Map<string, ProgressEmitter>;
  }
}
