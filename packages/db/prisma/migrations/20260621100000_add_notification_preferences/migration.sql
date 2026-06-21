-- Phase 3 notifications: per-member tray preferences. A MISSING row means the
-- category is ON; only opt-outs are stored. The channel enum is reserved for the
-- Phase 4 outbox — only IN_APP is written today.

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'EMAIL');

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "category" "NotificationCategory" NOT NULL,
    "channel" "DeliveryChannel" NOT NULL DEFAULT 'IN_APP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_preferences_organizationId_userId_idx" ON "notification_preferences"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_org_user_category_channel_key" ON "notification_preferences"("organizationId", "userId", "category", "channel");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
