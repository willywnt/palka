import type { Job } from 'bullmq';

import { runJobWithLogging } from '../utils/job-logger.js';
import { createWorker } from './create-worker.js';
import {
  processCleanupAuditLogsJob,
  processCleanupFailedUploadsJob,
  processCleanupRecordingsJob,
  processRecalculateStorageJob,
} from '../jobs/index.js';
import { JOB_NAMES, QUEUE_NAMES } from '../types/index.js';

export function registerAllWorkers() {
  createWorker(QUEUE_NAMES.RECORDING_CLEANUP, {
    concurrency: 1,
    processor: async (job: Job) => runJobWithLogging(job, processCleanupRecordingsJob),
  });

  createWorker(QUEUE_NAMES.STORAGE_RECALCULATION, {
    concurrency: 1,
    processor: async (job: Job) => runJobWithLogging(job, processRecalculateStorageJob),
  });

  createWorker(QUEUE_NAMES.UPLOAD_RECOVERY, {
    concurrency: 1,
    processor: async (job: Job) => runJobWithLogging(job, processCleanupFailedUploadsJob),
  });

  createWorker(QUEUE_NAMES.AUDIT_CLEANUP, {
    concurrency: 1,
    processor: async (job: Job) => runJobWithLogging(job, processCleanupAuditLogsJob),
  });

  return {
    queueNames: Object.values(QUEUE_NAMES),
    jobNames: Object.values(JOB_NAMES),
  };
}
