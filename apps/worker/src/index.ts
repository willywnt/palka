import { connectDb } from '@olshop/db';
import { getServerEnv } from '@olshop/config/env.server';
import { shutdownWorkerInfrastructure, startWorkerInfrastructure } from '@olshop/queue';
import { logger } from '@olshop/utils/logger';

import { startHealthServer } from './health-server.js';

const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
const ENABLE_SCHEDULERS = process.env.WORKER_ENABLE_SCHEDULERS !== 'false';

let isShuttingDown = false;

async function bootstrap(): Promise<void> {
  getServerEnv();

  await connectDb();
  await startWorkerInfrastructure({ registerSchedulers: ENABLE_SCHEDULERS });

  const healthServer = startHealthServer(HEALTH_PORT);

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('worker.signal.received', { signal });

    await new Promise<void>((resolve, reject) => {
      healthServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }).catch((error) => {
      logger.warn('worker.health.shutdown_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    await shutdownWorkerInfrastructure();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  logger.info('worker.started', {
    healthPort: HEALTH_PORT,
    schedulersEnabled: ENABLE_SCHEDULERS,
  });
}

bootstrap().catch((error) => {
  logger.error('worker.bootstrap.failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
