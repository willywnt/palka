import { prisma } from '@falka/db';
import { NOTIFICATION_RETENTION_DAYS } from '@falka/config/limits';

import {
  cleanupNotificationsJobSchema,
  type CleanupNotificationsJobPayload,
  type JobResultMetadata,
} from '../types/index.js';

type CleanupNotificationsStats = JobResultMetadata;

/**
 * Prune in-app notifications older than the retention window. Each business
 * event writes one Notification row, so without this the table grows unbounded.
 * NotificationRead rows reference the notification with onDelete: Cascade, so the
 * per-user read state is removed alongside its notification. Mirrors
 * processCleanupAuditLogsJob.
 */
export async function processCleanupNotificationsJob(
  rawPayload: CleanupNotificationsJobPayload,
): Promise<CleanupNotificationsStats> {
  const startedAt = Date.now();
  const payload = cleanupNotificationsJobSchema.parse(rawPayload);
  const cutoff = new Date(Date.now() - payload.retentionDays * 24 * 60 * 60 * 1000);

  const stats: CleanupNotificationsStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
  };

  if (payload.dryRun) {
    const count = await prisma.notification.count({
      where: { createdAt: { lt: cutoff } },
    });

    stats.processed = count;
    stats.succeeded = count;
    stats.durationMs = Date.now() - startedAt;
    return stats;
  }

  try {
    const staleNotifications = await prisma.notification.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: payload.batchSize,
    });

    if (staleNotifications.length === 0) {
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }

    const result = await prisma.notification.deleteMany({
      where: { id: { in: staleNotifications.map((notification) => notification.id) } },
    });

    stats.processed = result.count;
    stats.succeeded = result.count;
  } catch {
    stats.failed = 1;
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}

export function getDefaultCleanupNotificationsPayload(): CleanupNotificationsJobPayload {
  return cleanupNotificationsJobSchema.parse({
    retentionDays: NOTIFICATION_RETENTION_DAYS,
  });
}
