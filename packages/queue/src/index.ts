import { disconnectDb, healthCheckDb } from '@palka/db';
import { logger } from '@palka/utils/logger';

import { closeSharedRedisConnection, pingRedis } from './connection/index.js';
import { closeAllQueues } from './queues/create-queue.js';
import { registerScheduledJobs } from './queues/register-schedulers.js';
import { registerConfiguredStockProviders } from './marketplace-sync/register-providers.js';
import { closeAllWorkers, getRegisteredWorkers } from './workers/create-worker.js';
import { registerAllWorkers } from './workers/register-workers.js';
import type { getQueueObservabilitySnapshot } from './observability/queue-metrics.js';

export type WorkerBootstrapOptions = {
  registerSchedulers?: boolean;
};

export type WorkerHealthSnapshot = {
  status: 'ok' | 'degraded' | 'error';
  redis: boolean;
  database: boolean;
  workers: number;
  timestamp: string;
  queues?: Awaited<ReturnType<typeof getQueueObservabilitySnapshot>>;
};

export async function startWorkerInfrastructure(
  options: WorkerBootstrapOptions = {},
): Promise<void> {
  registerConfiguredStockProviders();
  registerAllWorkers();

  if (options.registerSchedulers ?? true) {
    await registerScheduledJobs();
  }

  logger.info('worker.infrastructure.started', {
    workers: getRegisteredWorkers().length,
    schedulersEnabled: options.registerSchedulers ?? true,
  });
}

export async function getWorkerHealthSnapshot(): Promise<WorkerHealthSnapshot> {
  const [redis, database] = await Promise.all([pingRedis(), healthCheckDb()]);
  const { getQueueObservabilitySnapshot } = await import('./observability/queue-metrics.js');
  const queues = redis ? await getQueueObservabilitySnapshot().catch(() => undefined) : undefined;

  const status = redis && database ? 'ok' : redis || database ? 'degraded' : 'error';

  return {
    status,
    redis,
    database,
    workers: getRegisteredWorkers().length,
    timestamp: new Date().toISOString(),
    queues,
  };
}

export async function shutdownWorkerInfrastructure(): Promise<void> {
  logger.info('worker.infrastructure.shutdown.started');

  await closeAllWorkers();
  await closeAllQueues();
  await closeSharedRedisConnection();
  await disconnectDb();

  logger.info('worker.infrastructure.shutdown.completed');
}

export * from './connection/index.js';
export * from './types/index.js';
export * from './jobs/index.js';
export * from './marketplace-sync/index.js';
export * from './queues/create-queue.js';
export * from './queues/marketplace-sync-producer.js';
export * from './queues/marketplace-import-producer.js';
export * from './queues/register-schedulers.js';
export * from './workers/create-worker.js';
export * from './workers/register-workers.js';
export * from './utils/index.js';
export * from './utils/job-logger.js';
export * from './observability/queue-metrics.js';
