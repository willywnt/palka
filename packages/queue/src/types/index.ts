import { z } from 'zod';

export const QUEUE_NAMES = {
  RECORDING_CLEANUP: 'recording-cleanup',
  STORAGE_RECALCULATION: 'storage-recalculation',
  UPLOAD_RECOVERY: 'upload-recovery',
  AUDIT_CLEANUP: 'audit-cleanup',
  INVENTORY_SYNC: 'inventory-sync',
  MARKETPLACE_STOCK_SYNC: 'marketplace-stock-sync',
  MARKETPLACE_TOKEN_REFRESH: 'marketplace-token-refresh',
  MARKETPLACE_PRODUCT_IMPORT: 'marketplace-product-import',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  CLEANUP_RECORDINGS: 'cleanup-recordings',
  RECALCULATE_STORAGE: 'recalculate-storage',
  CLEANUP_FAILED_UPLOADS: 'cleanup-failed-uploads',
  CLEANUP_AUDIT_LOGS: 'cleanup-audit-logs',
  VERIFY_STORAGE_CONSISTENCY: 'verify-storage-consistency',
  PROPAGATE_INVENTORY_STOCK: 'propagate-inventory-stock',
  SYNC_MARKETPLACE_STOCK: 'sync-marketplace-stock',
  REFRESH_MARKETPLACE_TOKENS: 'refresh-marketplace-tokens',
  IMPORT_MARKETPLACE_PRODUCTS: 'import-marketplace-products',
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

export const verifyStorageConsistencyJobSchema = z.object({
  batchSize: z.number().int().positive().max(500).default(100),
  dryRun: z.boolean().default(true),
  requestId: z.string().optional(),
});

export type VerifyStorageConsistencyJobPayload = z.infer<typeof verifyStorageConsistencyJobSchema>;

export const propagateInventoryStockJobSchema = z.object({
  userId: z.string().cuid(),
  variantId: z.string().cuid(),
  sku: z.string().min(1).max(100),
  eventId: z.string().cuid(),
  eventType: z.enum(['INCREASE', 'DECREASE', 'ADJUSTMENT', 'RESERVE', 'RELEASE', 'SYNC']),
  availableStock: z.number().int().nonnegative(),
  enqueuedAt: z.string().datetime(),
});

export type PropagateInventoryStockJobPayload = z.infer<typeof propagateInventoryStockJobSchema>;

export const syncMarketplaceStockJobSchema = z.object({
  syncJobId: z.string().cuid(),
  userId: z.string().cuid(),
  mappingId: z.string().cuid(),
  variantId: z.string().cuid(),
  availableStock: z.number().int().nonnegative(),
  eventId: z.string().cuid().optional(),
  enqueuedAt: z.string().datetime(),
});

export type SyncMarketplaceStockJobPayload = z.infer<typeof syncMarketplaceStockJobSchema>;

export const refreshMarketplaceTokensJobSchema = z.object({
  accountId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  batchSize: z.number().int().positive().max(100).default(25),
  dryRun: z.boolean().default(false),
});

export type RefreshMarketplaceTokensJobPayload = z.infer<typeof refreshMarketplaceTokensJobSchema>;

export const importMarketplaceProductsJobSchema = z.object({
  userId: z.string().cuid(),
  marketplaceAccountId: z.string().cuid(),
  dryRun: z.boolean().default(false),
  batchSize: z.number().int().positive().max(500).default(100),
});

export type ImportMarketplaceProductsJobPayload = z.infer<
  typeof importMarketplaceProductsJobSchema
>;

export type JobPayloadMap = {
  [JOB_NAMES.CLEANUP_RECORDINGS]: CleanupRecordingsJobPayload;
  [JOB_NAMES.RECALCULATE_STORAGE]: RecalculateStorageJobPayload;
  [JOB_NAMES.CLEANUP_FAILED_UPLOADS]: CleanupFailedUploadsJobPayload;
  [JOB_NAMES.CLEANUP_AUDIT_LOGS]: CleanupAuditLogsJobPayload;
  [JOB_NAMES.VERIFY_STORAGE_CONSISTENCY]: VerifyStorageConsistencyJobPayload;
  [JOB_NAMES.PROPAGATE_INVENTORY_STOCK]: PropagateInventoryStockJobPayload;
  [JOB_NAMES.SYNC_MARKETPLACE_STOCK]: SyncMarketplaceStockJobPayload;
  [JOB_NAMES.REFRESH_MARKETPLACE_TOKENS]: RefreshMarketplaceTokensJobPayload;
  [JOB_NAMES.IMPORT_MARKETPLACE_PRODUCTS]: ImportMarketplaceProductsJobPayload;
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
  marketplaceTokenRefresh: true;
  stockSynchronization: true;
  aiProcessing: false;
  thumbnailGeneration: false;
  ocrProcessing: false;
};

export const FUTURE_QUEUE_CAPABILITIES: FutureQueueCapabilities = {
  marketplaceTokenRefresh: true,
  stockSynchronization: true,
  aiProcessing: false,
  thumbnailGeneration: false,
  ocrProcessing: false,
};
