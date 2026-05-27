import { prisma } from '@olshop/db';
import { RecordingStatus } from '@prisma/client';

import {
  recalculateStorageJobSchema,
  type JobResultMetadata,
  type RecalculateStorageJobPayload,
} from '../types/index.js';

type RecalculateStats = JobResultMetadata;

export async function processRecalculateStorageJob(
  rawPayload: RecalculateStorageJobPayload,
): Promise<RecalculateStats> {
  const startedAt = Date.now();
  const payload = recalculateStorageJobSchema.parse(rawPayload);

  const stats: RecalculateStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    details: {
      repairedUsers: 0,
      unchangedUsers: 0,
    },
  };

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(payload.userId ? { id: payload.userId } : {}),
    },
    select: {
      id: true,
      storageUsedBytes: true,
    },
    take: payload.batchSize,
    orderBy: { updatedAt: 'asc' },
  });

  for (const user of users) {
    stats.processed += 1;

    const aggregate = await prisma.recording.aggregate({
      where: {
        userId: user.id,
        status: RecordingStatus.COMPLETED,
        deletedAt: null,
      },
      _sum: {
        fileSizeBytes: true,
      },
    });

    const calculatedUsed = aggregate._sum.fileSizeBytes ?? 0n;
    const currentUsed = user.storageUsedBytes;

    if (calculatedUsed === currentUsed) {
      stats.skipped += 1;
      stats.details!.unchangedUsers = Number(stats.details!.unchangedUsers) + 1;
      continue;
    }

    if (payload.dryRun) {
      stats.succeeded += 1;
      stats.details!.repairedUsers = Number(stats.details!.repairedUsers) + 1;
      continue;
    }

    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          storageUsedBytes: calculatedUsed,
        },
      });

      stats.succeeded += 1;
      stats.details!.repairedUsers = Number(stats.details!.repairedUsers) + 1;
    } catch {
      stats.failed += 1;
    }
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}

export function getDefaultRecalculateStoragePayload(): RecalculateStorageJobPayload {
  return recalculateStorageJobSchema.parse({});
}
