-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "memberLimit" INTEGER,
ADD COLUMN "permissions" JSONB,
ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'FREE';
