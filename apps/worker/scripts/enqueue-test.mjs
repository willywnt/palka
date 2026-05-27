import {
  closeAllQueues,
  closeSharedRedisConnection,
  createQueue,
  getDefaultCleanupAuditLogsPayload,
  getDefaultCleanupFailedUploadsPayload,
  getDefaultCleanupRecordingsPayload,
  getDefaultRecalculateStoragePayload,
  JOB_NAMES,
  QUEUE_NAMES,
} from '@olshop/queue';

const dryRun = !process.argv.includes('--live');

const testJobs = [
  {
    queueName: QUEUE_NAMES.RECORDING_CLEANUP,
    jobName: JOB_NAMES.CLEANUP_RECORDINGS,
    payload: { ...getDefaultCleanupRecordingsPayload(), dryRun },
  },
  {
    queueName: QUEUE_NAMES.STORAGE_RECALCULATION,
    jobName: JOB_NAMES.RECALCULATE_STORAGE,
    payload: { ...getDefaultRecalculateStoragePayload(), dryRun },
  },
  {
    queueName: QUEUE_NAMES.UPLOAD_RECOVERY,
    jobName: JOB_NAMES.CLEANUP_FAILED_UPLOADS,
    payload: { ...getDefaultCleanupFailedUploadsPayload(), dryRun },
  },
  {
    queueName: QUEUE_NAMES.AUDIT_CLEANUP,
    jobName: JOB_NAMES.CLEANUP_AUDIT_LOGS,
    payload: { ...getDefaultCleanupAuditLogsPayload(), dryRun },
  },
];

console.log(`Enqueuing ${testJobs.length} test jobs (dryRun=${dryRun})...`);

for (const { queueName, jobName, payload } of testJobs) {
  const queue = createQueue(queueName);
  const job = await queue.add(jobName, payload);
  console.log(`  ${queueName}/${jobName} -> ${job.id}`);
}

await closeAllQueues();
await closeSharedRedisConnection();

console.log('Done. Watch the worker logs for job processing.');
