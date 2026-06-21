import 'server-only';

import { prisma } from '@falka/db';
import type { NotificationCategory } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { NOTIFICATION_CATEGORIES } from '../notification-categories';
import type { NotificationPreferenceItem } from '../types';

// Phase 3 only writes the in-app channel; WHATSAPP/EMAIL are the Phase 4 outbox.
const CHANNEL = 'IN_APP' as const;

/**
 * Per-member, per-category notification preferences for the in-app tray. A MISSING
 * row means the category is ON — only opt-outs are stored — so a brand-new member
 * gets everything until they mute something. The tray read applies the muted set on
 * top of the RBAC category hiding (see hiddenNotificationCategories).
 */
export class NotificationPreferenceService {
  /** Every category with this member's current enabled state (missing row ⇒ enabled). */
  async getPreferences(
    organizationId: string,
    userId: string,
  ): Promise<NotificationPreferenceItem[]> {
    const rows = await prisma.notificationPreference.findMany({
      where: { organizationId, userId, channel: CHANNEL },
      select: { category: true, enabled: true },
    });
    const byCategory = new Map(rows.map((row) => [row.category, row.enabled]));

    return NOTIFICATION_CATEGORIES.map(({ category, label, description }) => ({
      category,
      label,
      description,
      enabled: byCategory.get(category) ?? true,
    }));
  }

  /** Categories this member has muted — fed to the tray as extra hidden categories. */
  async mutedCategories(organizationId: string, userId: string): Promise<NotificationCategory[]> {
    const rows = await prisma.notificationPreference.findMany({
      where: { organizationId, userId, channel: CHANNEL, enabled: false },
      select: { category: true },
    });
    return rows.map((row) => row.category);
  }

  /** Turn one category on/off for this member (upsert the IN_APP row). */
  async setPreference(
    organizationId: string,
    userId: string,
    category: NotificationCategory,
    enabled: boolean,
  ): Promise<void> {
    await prisma.notificationPreference.upsert({
      where: {
        organizationId_userId_category_channel: {
          organizationId,
          userId,
          category,
          channel: CHANNEL,
        },
      },
      create: { organizationId, userId, category, channel: CHANNEL, enabled },
      update: { enabled },
    });

    appLogger.info('notification.preference.set', { organizationId, userId, category, enabled });
  }
}

export const notificationPreferenceService = new NotificationPreferenceService();
