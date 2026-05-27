import { z } from 'zod';

export const QUEUE_NAMES = {
  RECORDING_CLEANUP: 'recording-cleanup',
  STORAGE_RECALCULATION: 'storage-recalculation',
  UPLOAD_RECOVERY: 'upload-recovery',
  AUDIT_CLEANUP: 'audit-cleanup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  CLEANUP_RECORDINGS: 'cleanup-recordings',
  RECALCULATE_STORAGE: 'recalculate-storage',
  CLEANUP_FAILED_UPLOADS: 'cleanup-failed-uploads',
  CLEANUP_AUDIT_LOGS: 'cleanup-audit-logs',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const cleanupRecordingsJobSchema = z.object({
  retentionDays: z.number().int().positive().default(30),
  batchSize: z.number().int().positive().max(500).default(100),
  dryRun: z.boolean().default(false),
});

export type CleanupRecordingsJobPayload = z.infer<typeof cleanupRecordingsJobSchema>;

export const recalculateStorageJobSchema = z.object({
  userId: z.string().cuid().optional(),
  batchSize: z.number().int().positive().max(500).default(50),
  dryRun: z.boolean().default(false),
});

export type RecalculateStorageJobPayload = z.infer<typeof recalculateStorageJobSchema>;

export const cleanupFailedUploadsJobSchema = z.object({
  staleSessionHours: z.number().int().positive().default(24),
  failedRetentionDays: z.number().int().positive().default(7),
  batchSize: z.number().int().positive().max(500).default(100),
  dryRun: z.boolean().default(false),
});

export type CleanupFailedUploadsJobPayload = z.infer<typeof cleanupFailedUploadsJobSchema>;

export const cleanupAuditLogsJobSchema = z.object({
  retentionDays: z.number().int().positive().default(90),
  batchSize: z.number().int().positive().max(1000).default(500),
  dryRun: z.boolean().default(false),
});

export type CleanupAuditLogsJobPayload = z.infer<typeof cleanupAuditLogsJobSchema>;

export type JobPayloadMap = {
  [JOB_NAMES.CLEANUP_RECORDINGS]: CleanupRecordingsJobPayload;
  [JOB_NAMES.RECALCULATE_STORAGE]: RecalculateStorageJobPayload;
  [JOB_NAMES.CLEANUP_FAILED_UPLOADS]: CleanupFailedUploadsJobPayload;
  [JOB_NAMES.CLEANUP_AUDIT_LOGS]: CleanupAuditLogsJobPayload;
};

export type JobResultMetadata = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
  details?: Record<string, unknown>;
};

export type FailedJobMetadata = {
  queueName: QueueName;
  jobName: string;
  jobId: string | undefined;
  attemptsMade: number;
  failedReason: string;
  payload: unknown;
  failedAt: string;
};

/** Reserved for future marketplace token refresh jobs. */
export type FutureQueueCapabilities = {
  marketplaceTokenRefresh: false;
  stockSynchronization: false;
  aiProcessing: false;
  thumbnailGeneration: false;
  ocrProcessing: false;
};

export const FUTURE_QUEUE_CAPABILITIES: FutureQueueCapabilities = {
  marketplaceTokenRefresh: false,
  stockSynchronization: false,
  aiProcessing: false,
  thumbnailGeneration: false,
  ocrProcessing: false,
};
