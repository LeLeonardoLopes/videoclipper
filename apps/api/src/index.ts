import { buildServer } from './server.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { whisperProcess } from './services/whisper-process.service.js';

async function main(): Promise<void> {
  const server = await buildServer();

  await whisperProcess.start();

  server.addHook('onClose', async () => {
    whisperProcess.stop();
  });

  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    logger.info(`Server running at http://${env.HOST}:${env.PORT}`);
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

main();
