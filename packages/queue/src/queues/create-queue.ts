import { Queue, type JobsOptions, type QueueOptions } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

import { duplicateRedisConnection } from '../connection/redis.js';
import { DEFAULT_JOB_OPTIONS } from '../utils/index.js';
import type { QueueName } from '../types/index.js';

const queueRegistry = new Map<QueueName, Queue>();

export type CreateQueueOptions = {
  connection?: ConnectionOptions;
  defaultJobOptions?: JobsOptions;
};

export function createQueue(queueName: QueueName, options: CreateQueueOptions = {}): Queue {
  const existing = queueRegistry.get(queueName);
  if (existing) return existing;

  const queueOptions: QueueOptions = {
    connection: options.connection ?? duplicateRedisConnection(`queue:${queueName}`),
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      ...options.defaultJobOptions,
    },
  };

  const queue = new Queue(queueName, queueOptions);
  queueRegistry.set(queueName, queue);
  return queue;
}

export function getRegisteredQueues(): Queue[] {
  return [...queueRegistry.values()];
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queueRegistry.values()].map((queue) => queue.close()));
  queueRegistry.clear();
}

export function getQueue(queueName: QueueName): Queue | undefined {
  return queueRegistry.get(queueName);
}
