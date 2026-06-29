import { z } from 'zod';

export const QUEUE_NAMES = {
  RECORDING_CLEANUP: 'recording-cleanup',
  STORAGE_RECALCULATION: 'storage-recalculation',
  UPLOAD_RECOVERY: 'upload-recovery',
  AUDIT_CLEANUP: 'audit-cleanup',
  NOTIFICATION_CLEANUP: 'notification-cleanup',
  MARKETPLACE_PROPAGATE: 'marketplace-propagate',
  MARKETPLACE_STOCK_SYNC: 'marketplace-stock-sync',
  MARKETPLACE_RECONCILE: 'marketplace-reconcile',
  MARKETPLACE_IMPORT: 'marketplace-import',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  CLEANUP_RECORDINGS: 'cleanup-recordings',
  RECALCULATE_STORAGE: 'recalculate-storage',
  CLEANUP_FAILED_UPLOADS: 'cleanup-failed-uploads',
  CLEANUP_AUDIT_LOGS: 'cleanup-audit-logs',
  CLEANUP_NOTIFICATIONS: 'cleanup-notifications',
  VERIFY_STORAGE_CONSISTENCY: 'verify-storage-consistency',
  PROPAGATE_INVENTORY_STOCK: 'propagate-inventory-stock',
  SYNC_MARKETPLACE_STOCK: 'sync-marketplace-stock',
  RECONCILE_MARKETPLACE_DRIFT: 'reconcile-marketplace-drift',
  REFRESH_MARKETPLACE_TOKENS: 'refresh-marketplace-tokens',
  IMPORT_MARKETPLACE_LISTINGS: 'import-marketplace-listings',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const cleanupRecordingsJobSchema = z.object({
  retentionDays: z.number().int().positive().default(30),
  batchSize: z.number().int().positive().max(500).default(100),
  dryRun: z.boolean().default(false),
});

export type CleanupRecordingsJobPayload = z.infer<typeof cleanupRecordingsJobSchema>;

export const recalculateStorageJobSchema = z.object({
  organizationId: z.string().cuid().optional(),
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

export const cleanupNotificationsJobSchema = z.object({
  retentionDays: z.number().int().positive().default(90),
  batchSize: z.number().int().positive().max(1000).default(500),
  dryRun: z.boolean().default(false),
});

export type CleanupNotificationsJobPayload = z.infer<typeof cleanupNotificationsJobSchema>;

export const verifyStorageConsistencyJobSchema = z.object({
  batchSize: z.number().int().positive().max(500).default(100),
  dryRun: z.boolean().default(true),
  requestId: z.string().optional(),
});

export type VerifyStorageConsistencyJobPayload = z.infer<typeof verifyStorageConsistencyJobSchema>;

export const propagateInventoryStockJobSchema = z.object({
  organizationId: z.string().cuid(),
  /** The user whose action triggered the stock change — recorded on sync-job rows. */
  actorUserId: z.string().cuid(),
  variantId: z.string().cuid(),
  availableStock: z.number().int(),
  /** The stock-ledger entry id that triggered this propagation (idempotency key). */
  eventId: z.string().min(1),
  /**
   * When set, mappings on this connection are skipped — used for inbound orders so
   * the channel the order came from isn't re-synced against its own stock change.
   */
  excludeConnectionId: z.string().cuid().optional(),
});

export type PropagateInventoryStockJobPayload = z.infer<typeof propagateInventoryStockJobSchema>;

export const syncMarketplaceStockJobSchema = z.object({
  syncJobId: z.string().cuid(),
});

export type SyncMarketplaceStockJobPayload = z.infer<typeof syncMarketplaceStockJobSchema>;

export const reconcileMarketplaceDriftJobSchema = z.object({
  /** Max connections to reconcile per run (caps provider calls). */
  batchSize: z.number().int().positive().max(500).default(100),
});

export type ReconcileMarketplaceDriftJobPayload = z.infer<
  typeof reconcileMarketplaceDriftJobSchema
>;

export const refreshMarketplaceTokensJobSchema = z.object({
  /** Refresh tokens that expire within this many days (catches lapsed ones too). */
  expiringWithinDays: z.number().int().positive().max(60).default(7),
  /** Max connections to refresh per run. */
  batchSize: z.number().int().positive().max(500).default(100),
});

export type RefreshMarketplaceTokensJobPayload = z.infer<typeof refreshMarketplaceTokensJobSchema>;

export const importMarketplaceListingsJobSchema = z.object({
  /** The MarketplaceImportJob row this run drives — everything else is read from the DB so the
   *  payload stays tiny and the worker is always working off the authoritative checkpoint. */
  importJobId: z.string().cuid(),
});

export type ImportMarketplaceListingsJobPayload = z.infer<
  typeof importMarketplaceListingsJobSchema
>;

export type JobPayloadMap = {
  [JOB_NAMES.CLEANUP_RECORDINGS]: CleanupRecordingsJobPayload;
  [JOB_NAMES.RECALCULATE_STORAGE]: RecalculateStorageJobPayload;
  [JOB_NAMES.CLEANUP_FAILED_UPLOADS]: CleanupFailedUploadsJobPayload;
  [JOB_NAMES.CLEANUP_AUDIT_LOGS]: CleanupAuditLogsJobPayload;
  [JOB_NAMES.CLEANUP_NOTIFICATIONS]: CleanupNotificationsJobPayload;
  [JOB_NAMES.VERIFY_STORAGE_CONSISTENCY]: VerifyStorageConsistencyJobPayload;
  [JOB_NAMES.PROPAGATE_INVENTORY_STOCK]: PropagateInventoryStockJobPayload;
  [JOB_NAMES.SYNC_MARKETPLACE_STOCK]: SyncMarketplaceStockJobPayload;
  [JOB_NAMES.RECONCILE_MARKETPLACE_DRIFT]: ReconcileMarketplaceDriftJobPayload;
  [JOB_NAMES.REFRESH_MARKETPLACE_TOKENS]: RefreshMarketplaceTokensJobPayload;
  [JOB_NAMES.IMPORT_MARKETPLACE_LISTINGS]: ImportMarketplaceListingsJobPayload;
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
