import type { NotificationCategory, NotificationSeverity, NotificationType } from '@prisma/client';

/** A persisted notification as the tray reads it (read = per-user, server-resolved). */
export type NotificationListItem = {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  href: string | null;
  /** The persistent mirror of a derived per-datum id — used to dedupe the two tiers. */
  dedupeKey: string;
  count: number;
  createdAt: string;
  read: boolean;
};

/** A member's per-category tray preference (IN_APP channel). `enabled` defaults on. */
export type NotificationPreferenceItem = {
  category: NotificationCategory;
  label: string;
  description: string;
  enabled: boolean;
};

/** What a producer hands `notificationServerService.emit` (best-effort, after its tx). */
export type EmitNotificationInput = {
  organizationId: string;
  /** The actor who triggered it (null = system/worker). */
  actorUserId?: string | null;
  /** null/undefined = org-wide (every member sees it); non-null = targeted to one user. */
  recipientUserId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  /** Stable idempotency key (entity-keyed for discrete events). */
  dedupeKey: string;
  /** Override the type's default severity. */
  severity?: NotificationSeverity;
  entityType?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown>;
  count?: number;
};
