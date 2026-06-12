-- Guard: the add_organizations backfill must be complete before NOT NULL lands.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products" WHERE "organizationId" IS NULL)
     OR EXISTS (SELECT 1 FROM "sales" WHERE "organizationId" IS NULL)
     OR EXISTS (SELECT 1 FROM "orders" WHERE "organizationId" IS NULL)
     OR EXISTS (SELECT 1 FROM "stock_ledger_entries" WHERE "organizationId" IS NULL)
     OR EXISTS (SELECT 1 FROM "recordings" WHERE "organizationId" IS NULL) THEN
    RAISE EXCEPTION 'org backfill incomplete - run add_organizations first';
  END IF;
END $$;
-- DropForeignKey
ALTER TABLE "bundles" DROP CONSTRAINT "bundles_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "marketplace_connections" DROP CONSTRAINT "marketplace_connections_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "marketplace_product_mappings" DROP CONSTRAINT "marketplace_product_mappings_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "marketplace_products" DROP CONSTRAINT "marketplace_products_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "marketplace_sync_jobs" DROP CONSTRAINT "marketplace_sync_jobs_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "recording_share_links" DROP CONSTRAINT "recording_share_links_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "recordings" DROP CONSTRAINT "recordings_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "returns" DROP CONSTRAINT "returns_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "sale_refunds" DROP CONSTRAINT "sale_refunds_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "sales" DROP CONSTRAINT "sales_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "stock_ledger_entries" DROP CONSTRAINT "stock_ledger_entries_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "stock_opnames" DROP CONSTRAINT "stock_opnames_organizationId_fkey";

-- DropIndex
DROP INDEX "bundles_userId_idx";

-- DropIndex
DROP INDEX "bundles_userId_sku_key";

-- DropIndex
DROP INDEX "marketplace_connections_userId_idx";

-- DropIndex
DROP INDEX "marketplace_product_mappings_userId_idx";

-- DropIndex
DROP INDEX "marketplace_products_userId_idx";

-- DropIndex
DROP INDEX "marketplace_sync_jobs_userId_idx";

-- DropIndex
DROP INDEX "orders_userId_idx";

-- DropIndex
DROP INDEX "product_variants_userId_idx";

-- DropIndex
DROP INDEX "product_variants_userId_sku_key";

-- DropIndex
DROP INDEX "products_userId_idx";

-- DropIndex
DROP INDEX "purchase_orders_code_idx";

-- DropIndex
DROP INDEX "purchase_orders_userId_idx";

-- DropIndex
DROP INDEX "recording_share_links_userId_idx";

-- DropIndex
DROP INDEX "recordings_noResi_idx";

-- DropIndex
DROP INDEX "recordings_userId_idx";

-- DropIndex
DROP INDEX "returns_userId_idx";

-- DropIndex
DROP INDEX "sale_refunds_userId_idx";

-- DropIndex
DROP INDEX "sales_code_idx";

-- DropIndex
DROP INDEX "sales_userId_idx";

-- DropIndex
DROP INDEX "stock_ledger_entries_userId_createdAt_idx";

-- DropIndex
DROP INDEX "stock_ledger_entries_userId_reason_createdAt_idx";

-- DropIndex
DROP INDEX "stock_opnames_code_idx";

-- DropIndex
DROP INDEX "stock_opnames_userId_idx";

-- AlterTable
ALTER TABLE "bundles" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "marketplace_connections" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "marketplace_product_mappings" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "marketplace_products" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "marketplace_sync_jobs" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "purchase_orders" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "recording_share_links" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "recordings" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "returns" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "sale_refunds" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "stock_ledger_entries" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "stock_opnames" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "storageQuotaBytes",
DROP COLUMN "storageUsedBytes";

-- CreateIndex
CREATE INDEX "bundles_organizationId_idx" ON "bundles"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_organizationId_sku_key" ON "bundles"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "marketplace_connections_organizationId_idx" ON "marketplace_connections"("organizationId");

-- CreateIndex
CREATE INDEX "marketplace_product_mappings_organizationId_idx" ON "marketplace_product_mappings"("organizationId");

-- CreateIndex
CREATE INDEX "marketplace_products_organizationId_idx" ON "marketplace_products"("organizationId");

-- CreateIndex
CREATE INDEX "marketplace_sync_jobs_organizationId_idx" ON "marketplace_sync_jobs"("organizationId");

-- CreateIndex
CREATE INDEX "orders_organizationId_idx" ON "orders"("organizationId");

-- CreateIndex
CREATE INDEX "product_variants_organizationId_idx" ON "product_variants"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organizationId_sku_key" ON "product_variants"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "products_organizationId_idx" ON "products"("organizationId");

-- CreateIndex
CREATE INDEX "purchase_orders_organizationId_idx" ON "purchase_orders"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organizationId_code_key" ON "purchase_orders"("organizationId", "code");

-- CreateIndex
CREATE INDEX "recording_share_links_organizationId_idx" ON "recording_share_links"("organizationId");

-- CreateIndex
CREATE INDEX "recordings_organizationId_idx" ON "recordings"("organizationId");

-- CreateIndex
CREATE INDEX "recordings_organizationId_noResi_idx" ON "recordings"("organizationId", "noResi");

-- CreateIndex
CREATE INDEX "returns_organizationId_idx" ON "returns"("organizationId");

-- CreateIndex
CREATE INDEX "sale_refunds_organizationId_idx" ON "sale_refunds"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_refunds_organizationId_code_key" ON "sale_refunds"("organizationId", "code");

-- CreateIndex
CREATE INDEX "sales_organizationId_idx" ON "sales"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_organizationId_code_key" ON "sales"("organizationId", "code");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_organizationId_reason_createdAt_idx" ON "stock_ledger_entries"("organizationId", "reason", "createdAt");

-- CreateIndex
CREATE INDEX "stock_ledger_entries_organizationId_createdAt_idx" ON "stock_ledger_entries"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_opnames_organizationId_idx" ON "stock_opnames"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_opnames_organizationId_code_key" ON "stock_opnames"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_share_links" ADD CONSTRAINT "recording_share_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_connections" ADD CONSTRAINT "marketplace_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_products" ADD CONSTRAINT "marketplace_products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_product_mappings" ADD CONSTRAINT "marketplace_product_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_sync_jobs" ADD CONSTRAINT "marketplace_sync_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opnames" ADD CONSTRAINT "stock_opnames_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

