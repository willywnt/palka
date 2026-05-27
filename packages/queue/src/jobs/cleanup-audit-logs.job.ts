import { prisma } from '@olshop/db';
import { AUDIT_LOG_RETENTION_DAYS } from '@olshop/config/limits';

import {
  cleanupAuditLogsJobSchema,
  type CleanupAuditLogsJobPayload,
  type JobResultMetadata,
} from '../types/index.js';

type CleanupAuditStats = JobResultMetadata;

export async function processCleanupAuditLogsJob(
  rawPayload: CleanupAuditLogsJobPayload,
): Promise<CleanupAuditStats> {
  const startedAt = Date.now();
  const payload = cleanupAuditLogsJobSchema.parse(rawPayload);
  const cutoff = new Date(Date.now() - payload.retentionDays * 24 * 60 * 60 * 1000);

  const stats: CleanupAuditStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
  };

  if (payload.dryRun) {
    const count = await prisma.auditLog.count({
      where: { createdAt: { lt: cutoff } },
    });

    stats.processed = count;
    stats.succeeded = count;
    stats.durationMs = Date.now() - startedAt;
    return stats;
  }

  try {
    const staleLogs = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: payload.batchSize,
    });

    if (staleLogs.length === 0) {
      stats.durationMs = Date.now() - startedAt;
      return stats;
    }

    const result = await prisma.auditLog.deleteMany({
      where: { id: { in: staleLogs.map((log) => log.id) } },
    });

    stats.processed = result.count;
    stats.succeeded = result.count;
  } catch {
    stats.failed = 1;
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}

export function getDefaultCleanupAuditLogsPayload(): CleanupAuditLogsJobPayload {
  return cleanupAuditLogsJobSchema.parse({
    retentionDays: AUDIT_LOG_RETENTION_DAYS,
  });
}
