-- Marketplace product import + SKU mapping foundation

CREATE TYPE "MarketplaceMappingStatus" AS ENUM (
  'MAPPED',
  'UNMAPPED',
  'BROKEN',
  'CONFLICT',
  'SYNC_DISABLED'
);

CREATE TABLE "marketplace_products" (
  "id" TEXT NOT NULL,
  "marketplaceAccountId" TEXT NOT NULL,
  "provider" "MarketplaceProvider" NOT NULL,
  "externalProductId" TEXT NOT NULL,
  "externalVariantId" TEXT NOT NULL,
  "externalSku" TEXT,
  "externalProductName" TEXT NOT NULL,
  "externalVariantName" TEXT,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "rawPayload" JSONB,
  "lastImportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "marketplace_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_products_marketplaceAccountId_externalVariantId_key"
  ON "marketplace_products"("marketplaceAccountId", "externalVariantId");
CREATE INDEX "marketplace_products_marketplaceAccountId_idx" ON "marketplace_products"("marketplaceAccountId");
CREATE INDEX "marketplace_products_provider_idx" ON "marketplace_products"("provider");
CREATE INDEX "marketplace_products_externalSku_idx" ON "marketplace_products"("externalSku");
CREATE INDEX "marketplace_products_status_idx" ON "marketplace_products"("status");
CREATE INDEX "marketplace_products_lastImportedAt_idx" ON "marketplace_products"("lastImportedAt");

ALTER TABLE "marketplace_products"
  ADD CONSTRAINT "marketplace_products_marketplaceAccountId_fkey"
  FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketplace_variant_mappings" RENAME TO "marketplace_product_mappings";
ALTER TABLE "marketplace_product_mappings" RENAME COLUMN "variantId" TO "productVariantId";

ALTER TABLE "marketplace_product_mappings" ADD COLUMN "marketplaceProductId" TEXT;
ALTER TABLE "marketplace_product_mappings" ADD COLUMN "provider" "MarketplaceProvider";
ALTER TABLE "marketplace_product_mappings" ADD COLUMN "mappingStatus" "MarketplaceMappingStatus" NOT NULL DEFAULT 'MAPPED';
ALTER TABLE "marketplace_product_mappings" ADD COLUMN "syncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "marketplace_product_mappings" ADD COLUMN "autoMapped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "marketplace_product_mappings" ADD COLUMN "mappingConfidence" DECIMAL(5,4);
ALTER TABLE "marketplace_product_mappings" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "marketplace_product_mappings" DROP COLUMN IF EXISTS "externalProductId";
ALTER TABLE "marketplace_product_mappings" DROP COLUMN IF EXISTS "externalVariantId";
ALTER TABLE "marketplace_product_mappings" DROP COLUMN IF EXISTS "externalSku";
ALTER TABLE "marketplace_product_mappings" DROP COLUMN IF EXISTS "syncStatus";
ALTER TABLE "marketplace_product_mappings" DROP COLUMN IF EXISTS "lastSyncedAt";
ALTER TABLE "marketplace_product_mappings" DROP COLUMN IF EXISTS "lastSyncError";

DROP INDEX IF EXISTS "marketplace_variant_mappings_variantId_idx";
DROP INDEX IF EXISTS "marketplace_variant_mappings_syncStatus_idx";
DROP INDEX IF EXISTS "marketplace_variant_mappings_externalSku_idx";
DROP INDEX IF EXISTS "marketplace_variant_mappings_marketplaceAccountId_variantId_key";

CREATE INDEX "marketplace_product_mappings_productVariantId_idx" ON "marketplace_product_mappings"("productVariantId");
CREATE INDEX "marketplace_product_mappings_marketplaceProductId_idx" ON "marketplace_product_mappings"("marketplaceProductId");
CREATE INDEX "marketplace_product_mappings_mappingStatus_idx" ON "marketplace_product_mappings"("mappingStatus");
CREATE INDEX "marketplace_product_mappings_syncEnabled_idx" ON "marketplace_product_mappings"("syncEnabled");

ALTER TABLE "marketplace_sync_logs" DROP CONSTRAINT IF EXISTS "marketplace_sync_logs_mappingId_fkey";
ALTER TABLE "marketplace_product_mappings" DROP CONSTRAINT IF EXISTS "marketplace_variant_mappings_variantId_fkey";
ALTER TABLE "marketplace_product_mappings" DROP CONSTRAINT IF EXISTS "marketplace_variant_mappings_marketplaceAccountId_fkey";

ALTER TABLE "marketplace_product_mappings"
  ADD CONSTRAINT "marketplace_product_mappings_productVariantId_fkey"
  FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketplace_product_mappings"
  ADD CONSTRAINT "marketplace_product_mappings_marketplaceAccountId_fkey"
  FOREIGN KEY ("marketplaceAccountId") REFERENCES "marketplace_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketplace_sync_logs"
  ADD CONSTRAINT "marketplace_sync_logs_mappingId_fkey"
  FOREIGN KEY ("mappingId") REFERENCES "marketplace_product_mappings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketplace_product_mappings"
  ADD CONSTRAINT "marketplace_product_mappings_marketplaceProductId_fkey"
  FOREIGN KEY ("marketplaceProductId") REFERENCES "marketplace_products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "marketplace_product_mappings_marketplaceAccountId_productVariantId_key"
  ON "marketplace_product_mappings"("marketplaceAccountId", "productVariantId")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "marketplace_product_mappings_marketplaceAccountId_marketplaceProductId_key"
  ON "marketplace_product_mappings"("marketplaceAccountId", "marketplaceProductId")
  WHERE "deletedAt" IS NULL AND "marketplaceProductId" IS NOT NULL;
