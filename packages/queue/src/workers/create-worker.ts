import { Worker, type Processor, type WorkerOptions } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

import { duplicateRedisConnection } from '../connection/redis.js';
import { logPermanentJobFailure } from '../utils/job-logger.js';
import type { QueueName } from '../types/index.js';

const workerRegistry: Worker[] = [];

export type CreateWorkerOptions<TData = unknown, TResult = unknown> = {
  connection?: ConnectionOptions;
  concurrency?: number;
  processor: Processor<TData, TResult>;
  workerOptions?: Omit<WorkerOptions, 'connection' | 'concurrency'>;
};

export function createWorker<TData = unknown, TResult = unknown>(
  queueName: QueueName,
  options: CreateWorkerOptions<TData, TResult>,
): Worker<TData, TResult> {
  const worker = new Worker<TData, TResult>(queueName, options.processor, {
    connection: options.connection ?? duplicateRedisConnection(`worker:${queueName}`),
    concurrency: options.concurrency ?? 1,
    ...options.workerOptions,
  });

  worker.on('failed', (job, error) => {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      logPermanentJobFailure(job, error);
    }
  });

  workerRegistry.push(worker);
  return worker;
}

export function getRegisteredWorkers(): Worker[] {
  return [...workerRegistry];
}

export async function closeAllWorkers(): Promise<void> {
  await Promise.all(workerRegistry.map((worker) => worker.close()));
  workerRegistry.length = 0;
}
