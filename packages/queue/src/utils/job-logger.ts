import type { Job } from 'bullmq';

import { logger } from '@olshop/utils/logger';

import type { JobResultMetadata } from '../types/index.js';

type JobLogContext = {
  queueName: string;
  jobName: string;
  jobId: string | undefined;
  attemptsMade: number;
};

function getJobContext(job: Job): JobLogContext {
  return {
    queueName: job.queueName,
    jobName: job.name,
    jobId: job.id,
    attemptsMade: job.attemptsMade,
  };
}

export async function runJobWithLogging<TPayload, TResult extends JobResultMetadata>(
  job: Job<TPayload>,
  handler: (payload: TPayload) => Promise<TResult>,
): Promise<TResult> {
  const context = getJobContext(job);
  const startedAt = Date.now();

  logger.info('job.started', {
    ...context,
    payload: job.data,
  });

  try {
    const result = await handler(job.data);
    const durationMs = Date.now() - startedAt;

    logger.info('job.completed', {
      ...context,
      durationMs,
      result,
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    logger.error('job.failed', {
      ...context,
      durationMs,
      error: message,
      willRetry: job.attemptsMade < (job.opts.attempts ?? 1),
    });

    throw error;
  }
}

export function logPermanentJobFailure(job: Job, error: Error): void {
  logger.error('job.dead_letter', {
    queueName: job.queueName,
    jobName: job.name,
    jobId: job.id,
    attemptsMade: job.attemptsMade,
    failedReason: error.message,
    payload: job.data,
    failedAt: new Date().toISOString(),
  });
}
