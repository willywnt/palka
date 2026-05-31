-- Marketplace stock sync job foundation

CREATE TYPE "MarketplaceSyncJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'RETRYING',
  'DISABLED'
);

CREATE TYPE "MarketplaceSyncType" AS ENUM (
  'STOCK_PUSH',
  'STOCK_RECONCILE'
);

CREATE TABLE "marketplace_sync_jobs" (
  "id" TEXT NOT NULL,
  "marketplaceAccountId" TEXT NOT NULL,
  "marketplaceProductMappingId" TEXT NOT NULL,
  "provider" "MarketplaceProvider" NOT NULL,
  "syncType" "MarketplaceSyncType" NOT NULL DEFAULT 'STOCK_PUSH',
  "syncStatus" "MarketplaceSyncJobStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB,
  "providerResponse" JSONB,
  "idempotencyKey" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_sync_jobs_idempotencyKey_key"
  ON "marketplace_sync_jobs"("idempotencyKey");

CREATE INDEX "marketplace_sync_jobs_marketplaceAccountId_idx"
  ON "marketplace_sync_jobs"("marketplaceAccountId");
CREATE INDEX "marketplace_sync_jobs_marketplaceProductMappingId_idx"
  ON "marketplace_sync_jobs"("marketplaceProductMappingId");
CREATE INDEX "marketplace_sync_jobs_syncStatus_idx"
  ON "marketplace_sync_jobs"("syncStatus");
CREATE INDEX "marketplace_sync_jobs_syncType_idx"
  ON "marketplace_sync_jobs"("syncType");
CREATE INDEX "marketplace_sync_jobs_createdAt_idx"
  ON "marketplace_sync_jobs"("createdAt");
CREATE INDEX "marketplace_sync_jobs_lastAttemptAt_idx"
  ON "marketplace_sync_jobs"("lastAttemptAt");

ALTER TABLE "marketplace_sync_jobs"
  ADD CONSTRAINT "marketplace_sync_jobs_marketplaceAccountId_fkey"
  FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketplace_sync_jobs"
  ADD CONSTRAINT "marketplace_sync_jobs_marketplaceProductMappingId_fkey"
  FOREIGN KEY ("marketplaceProductMappingId") REFERENCES "marketplace_product_mappings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "marketplace_provider_health" (
  "id" TEXT NOT NULL,
  "marketplaceAccountId" TEXT NOT NULL,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "averageLatencyMs" INTEGER,
  "lastErrorCode" TEXT,
  "tokenValid" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_provider_health_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_provider_health_marketplaceAccountId_key"
  ON "marketplace_provider_health"("marketplaceAccountId");

ALTER TABLE "marketplace_provider_health"
  ADD CONSTRAINT "marketplace_provider_health_marketplaceAccountId_fkey"
  FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
