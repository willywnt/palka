-- Marketplace account foundation: evolve connections into accounts with lifecycle status.

-- Extend provider enum
ALTER TYPE "MarketplaceProvider" ADD VALUE IF NOT EXISTS 'TIKTOK';
ALTER TYPE "MarketplaceProvider" ADD VALUE IF NOT EXISTS 'LAZADA';

-- Account status enum
CREATE TYPE "MarketplaceAccountStatus" AS ENUM (
  'CONNECTED',
  'EXPIRED',
  'DISCONNECTED',
  'ERROR',
  'RECONNECT_REQUIRED',
  'SYNC_DISABLED'
);

-- Rename connection table to accounts
ALTER TABLE "marketplace_connections" RENAME TO "marketplace_accounts";

-- Rename columns
ALTER TABLE "marketplace_accounts" RENAME COLUMN "shopId" TO "externalStoreId";
ALTER TABLE "marketplace_accounts" RENAME COLUMN "shopName" TO "storeName";

-- Add lifecycle columns
ALTER TABLE "marketplace_accounts" ADD COLUMN "status" "MarketplaceAccountStatus" NOT NULL DEFAULT 'CONNECTED';
ALTER TABLE "marketplace_accounts" ADD COLUMN "lastConnectedAt" TIMESTAMP(3);
ALTER TABLE "marketplace_accounts" ADD COLUMN "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "marketplace_accounts" ADD COLUMN "metadata" JSONB;

-- Migrate isActive → status
UPDATE "marketplace_accounts"
SET "status" = CASE
  WHEN "isActive" = true THEN 'CONNECTED'::"MarketplaceAccountStatus"
  ELSE 'DISCONNECTED'::"MarketplaceAccountStatus"
END;

UPDATE "marketplace_accounts"
SET "lastConnectedAt" = "createdAt"
WHERE "status" = 'CONNECTED'::"MarketplaceAccountStatus";

ALTER TABLE "marketplace_accounts" DROP COLUMN "isActive";

-- Indexes
CREATE INDEX "marketplace_accounts_status_idx" ON "marketplace_accounts"("status");
CREATE INDEX "marketplace_accounts_tokenExpiresAt_idx" ON "marketplace_accounts"("tokenExpiresAt");
CREATE UNIQUE INDEX "marketplace_accounts_userId_provider_externalStoreId_key"
  ON "marketplace_accounts"("userId", "provider", "externalStoreId");

-- Variant mapping FK rename
ALTER TABLE "marketplace_variant_mappings" RENAME COLUMN "marketplaceConnectionId" TO "marketplaceAccountId";

ALTER TABLE "marketplace_variant_mappings" DROP CONSTRAINT IF EXISTS "marketplace_variant_mappings_marketplaceConnectionId_fkey";
ALTER TABLE "marketplace_variant_mappings" DROP CONSTRAINT IF EXISTS "marketplace_variant_mappings_marketplaceConnectionId_variantI_key";

CREATE UNIQUE INDEX "marketplace_variant_mappings_marketplaceAccountId_variantId_key"
  ON "marketplace_variant_mappings"("marketplaceAccountId", "variantId");

ALTER TABLE "marketplace_variant_mappings"
  ADD CONSTRAINT "marketplace_variant_mappings_marketplaceAccountId_fkey"
  FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
