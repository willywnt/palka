import { logger } from '@falka/utils/logger';

import { createQueue } from '../queues/create-queue.js';
import { buildScheduledJobId } from '../utils/index.js';
import {
  getDefaultCleanupAuditLogsPayload,
  getDefaultCleanupFailedUploadsPayload,
  getDefaultCleanupNotificationsPayload,
  getDefaultCleanupRecordingsPayload,
  getDefaultReconcileMarketplaceDriftPayload,
  getDefaultRefreshMarketplaceTokensPayload,
  getDefaultRecalculateStoragePayload,
  getDefaultVerifyStorageConsistencyPayload,
} from '../jobs/index.js';
import { JOB_NAMES, QUEUE_NAMES } from '../types/index.js';

export async function registerScheduledJobs(): Promise<void> {
  const recordingCleanupQueue = createQueue(QUEUE_NAMES.RECORDING_CLEANUP);
  const storageQueue = createQueue(QUEUE_NAMES.STORAGE_RECALCULATION);
  const uploadRecoveryQueue = createQueue(QUEUE_NAMES.UPLOAD_RECOVERY);
  const auditCleanupQueue = createQueue(QUEUE_NAMES.AUDIT_CLEANUP);
  const notificationCleanupQueue = createQueue(QUEUE_NAMES.NOTIFICATION_CLEANUP);
  const marketplaceReconcileQueue = createQueue(QUEUE_NAMES.MARKETPLACE_RECONCILE);

  await recordingCleanupQueue.add(
    JOB_NAMES.CLEANUP_RECORDINGS,
    getDefaultCleanupRecordingsPayload(),
    {
      jobId: buildScheduledJobId(
        QUEUE_NAMES.RECORDING_CLEANUP,
        JOB_NAMES.CLEANUP_RECORDINGS,
        'daily',
      ),
      repeat: { pattern: '0 2 * * *' },
    },
  );

  await storageQueue.add(JOB_NAMES.RECALCULATE_STORAGE, getDefaultRecalculateStoragePayload(), {
    jobId: buildScheduledJobId(
      QUEUE_NAMES.STORAGE_RECALCULATION,
      JOB_NAMES.RECALCULATE_STORAGE,
      'daily',
    ),
    repeat: { pattern: '0 3 * * *' },
  });

  await storageQueue.add(
    JOB_NAMES.VERIFY_STORAGE_CONSISTENCY,
    getDefaultVerifyStorageConsistencyPayload(),
    {
      jobId: buildScheduledJobId(
        QUEUE_NAMES.STORAGE_RECALCULATION,
        JOB_NAMES.VERIFY_STORAGE_CONSISTENCY,
        'daily',
      ),
      repeat: { pattern: '0 5 * * *' },
    },
  );

  await uploadRecoveryQueue.add(
    JOB_NAMES.CLEANUP_FAILED_UPLOADS,
    getDefaultCleanupFailedUploadsPayload(),
    {
      jobId: buildScheduledJobId(
        QUEUE_NAMES.UPLOAD_RECOVERY,
        JOB_NAMES.CLEANUP_FAILED_UPLOADS,
        'every-6-hours',
      ),
      repeat: { pattern: '0 */6 * * *' },
    },
  );

  await auditCleanupQueue.add(JOB_NAMES.CLEANUP_AUDIT_LOGS, getDefaultCleanupAuditLogsPayload(), {
    jobId: buildScheduledJobId(QUEUE_NAMES.AUDIT_CLEANUP, JOB_NAMES.CLEANUP_AUDIT_LOGS, 'daily'),
    repeat: { pattern: '0 4 * * *' },
  });

  await notificationCleanupQueue.add(
    JOB_NAMES.CLEANUP_NOTIFICATIONS,
    getDefaultCleanupNotificationsPayload(),
    {
      jobId: buildScheduledJobId(
        QUEUE_NAMES.NOTIFICATION_CLEANUP,
        JOB_NAMES.CLEANUP_NOTIFICATIONS,
        'daily',
      ),
      repeat: { pattern: '0 7 * * *' },
    },
  );

  await marketplaceReconcileQueue.add(
    JOB_NAMES.RECONCILE_MARKETPLACE_DRIFT,
    getDefaultReconcileMarketplaceDriftPayload(),
    {
      jobId: buildScheduledJobId(
        QUEUE_NAMES.MARKETPLACE_RECONCILE,
        JOB_NAMES.RECONCILE_MARKETPLACE_DRIFT,
        'daily',
      ),
      repeat: { pattern: '0 6 * * *' },
    },
  );

  await marketplaceReconcileQueue.add(
    JOB_NAMES.REFRESH_MARKETPLACE_TOKENS,
    getDefaultRefreshMarketplaceTokensPayload(),
    {
      jobId: buildScheduledJobId(
        QUEUE_NAMES.MARKETPLACE_RECONCILE,
        JOB_NAMES.REFRESH_MARKETPLACE_TOKENS,
        'daily',
      ),
      repeat: { pattern: '0 5 * * *' },
    },
  );

  logger.info('queue.schedulers.registered', {
    queues: Object.values(QUEUE_NAMES),
  });
}
