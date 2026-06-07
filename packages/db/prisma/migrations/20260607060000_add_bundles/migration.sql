-- CreateTable
CREATE TABLE "bundles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "imageKey" TEXT,
    "imageUrl" TEXT,
    "labelPrintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_items" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bundles_userId_idx" ON "bundles"("userId");

-- CreateIndex
CREATE INDEX "bundles_barcode_idx" ON "bundles"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_userId_sku_key" ON "bundles"("userId", "sku");

-- CreateIndex
CREATE INDEX "bundle_items_bundleId_idx" ON "bundle_items"("bundleId");

-- CreateIndex
CREATE INDEX "bundle_items_productVariantId_idx" ON "bundle_items"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "bundle_items_bundleId_productVariantId_key" ON "bundle_items"("bundleId", "productVariantId");

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN "bundleName" TEXT;

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN "bundleName" TEXT;
