import type { Job } from 'bullmq';
import { JOB_DEFAULT_ATTEMPTS } from '@falka/config/limits';

import { runJobWithLogging } from '../utils/job-logger.js';
import { createWorker } from './create-worker.js';
import {
  processCleanupAuditLogsJob,
  processCleanupNotificationsJob,
  processCleanupFailedUploadsJob,
  processCleanupRecordingsJob,
  processPropagateInventoryStockJob,
  processReconcileMarketplaceDriftJob,
  processRefreshMarketplaceTokensJob,
  processRecalculateStorageJob,
  processSyncMarketplaceStockJob,
  processVerifyStorageConsistencyJob,
} from '../jobs/index.js';
import { JOB_NAMES, QUEUE_NAMES, type SyncMarketplaceStockJobPayload } from '../types/index.js';

export function registerAllWorkers() {
  createWorker(QUEUE_NAMES.RECORDING_CLEANUP, {
    concurrency: 1,
    processor: async (job: Job) => runJobWithLogging(job, processCleanupRecordingsJob),
  });

  createWorker(QUEUE_NAMES.STORAGE_RECALCULATION, {
    concurrency: 1,
    processor: async (job: Job) => {
      if (job.name === JOB_NAMES.VERIFY_STORAGE_CONSISTENCY) {
        return runJobWithLogging(job, processVerifyStorageConsistencyJob);
      }

      return runJobWithLogging(job, processRecalculateStorageJob);
    },
  });

  createWorker(QUEUE_NAMES.UPLOAD_RECOVERY, {
    concurrency: 1,
    processor: async (job: Job) => runJobWithLogging(job, processCleanupFailedUploadsJob),
  });

  createWorker(QUEUE_NAMES.AUDIT_CLEANUP, {
    concurrency: 1,
    processor: async (job: Job) => runJobWithLogging(job, processCleanupAuditLogsJob),
  });

  createWorker(QUEUE_NAMES.NOTIFICATION_CLEANUP, {
    concurrency: 1,
    processor: async (job: Job) => runJobWithLogging(job, processCleanupNotificationsJob),
  });

  createWorker(QUEUE_NAMES.MARKETPLACE_PROPAGATE, {
    concurrency: 2,
    processor: async (job: Job) => runJobWithLogging(job, processPropagateInventoryStockJob),
  });

  createWorker(QUEUE_NAMES.MARKETPLACE_STOCK_SYNC, {
    concurrency: 4,
    processor: async (job: Job) =>
      runJobWithLogging(job, (payload: SyncMarketplaceStockJobPayload) =>
        processSyncMarketplaceStockJob(
          payload,
          job.attemptsMade + 1,
          job.opts.attempts ?? JOB_DEFAULT_ATTEMPTS,
        ),
      ),
  });

  createWorker(QUEUE_NAMES.MARKETPLACE_RECONCILE, {
    concurrency: 1,
    processor: async (job: Job) => {
      if (job.name === JOB_NAMES.REFRESH_MARKETPLACE_TOKENS) {
        return runJobWithLogging(job, processRefreshMarketplaceTokensJob);
      }

      return runJobWithLogging(job, processReconcileMarketplaceDriftJob);
    },
  });

  return {
    queueNames: Object.values(QUEUE_NAMES),
    jobNames: Object.values(JOB_NAMES),
  };
}
