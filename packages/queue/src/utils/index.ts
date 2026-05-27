import { JOB_DEFAULT_ATTEMPTS, JOB_DEFAULT_BACKOFF_MS } from '@olshop/config/limits';

export const DEFAULT_JOB_OPTIONS = {
  attempts: JOB_DEFAULT_ATTEMPTS,
  backoff: {
    type: 'exponential' as const,
    delay: JOB_DEFAULT_BACKOFF_MS,
  },
  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 1_000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 5_000,
  },
};

export function buildScheduledJobId(queueName: string, jobName: string, cadence: string): string {
  return `scheduled:${queueName}:${jobName}:${cadence}`;
}

export function isPendingStorageKey(storageKey: string): boolean {
  return storageKey.startsWith('pending/');
}

export function isUserRecordingStorageKey(storageKey: string, userId: string): boolean {
  return storageKey.startsWith(`recordings/${userId}/`);
}
