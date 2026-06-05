-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "options" JSONB;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "optionTypes" JSONB;
