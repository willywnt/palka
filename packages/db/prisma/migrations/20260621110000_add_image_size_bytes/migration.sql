-- Bill product/variant + bundle photos against the org storage quota. Persist each
-- image's byte size (mirrors Recording.fileSizeBytes) so the quota can be released on
-- delete/replace. Additive nullable columns — existing rows are unaffected.

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "imageSizeBytes" BIGINT;

-- AlterTable
ALTER TABLE "bundles" ADD COLUMN "imageSizeBytes" BIGINT;
