-- AlterTable: incremental catalog-import watermark (advanced only on a complete import)
ALTER TABLE "marketplace_connections" ADD COLUMN "listingsSyncedThrough" TIMESTAMP(3);

-- AlterTable: per-import "full re-pull" flag (snapshotted so a resume keeps the same scope)
ALTER TABLE "marketplace_import_jobs" ADD COLUMN "full" BOOLEAN NOT NULL DEFAULT false;
