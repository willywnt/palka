import { prisma } from '@olshop/db';
import { FAILED_UPLOAD_RETENTION_DAYS, STALE_RECORDING_SESSION_HOURS } from '@olshop/config/limits';
import { RecordingStatus } from '@prisma/client';
import { getObjectStorageProvider } from '@olshop/storage';

import {
  cleanupFailedUploadsJobSchema,
  type CleanupFailedUploadsJobPayload,
  type JobResultMetadata,
} from '../types/index.js';
import { isPendingStorageKey } from '../utils/index.js';

type CleanupFailedUploadStats = JobResultMetadata;

export async function processCleanupFailedUploadsJob(
  rawPayload: CleanupFailedUploadsJobPayload,
): Promise<CleanupFailedUploadStats> {
  const startedAt = Date.now();
  const payload = cleanupFailedUploadsJobSchema.parse(rawPayload);

  const staleSessionCutoff = new Date(Date.now() - payload.staleSessionHours * 60 * 60 * 1000);
  const failedRetentionCutoff = new Date(
    Date.now() - payload.failedRetentionDays * 24 * 60 * 60 * 1000,
  );

  const stats: CleanupFailedUploadStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    details: {
      staleSessionsMarkedFailed: 0,
      failedMetadataCleaned: 0,
      orphanObjectsDeleted: 0,
    },
  };

  const staleSessions = await prisma.recording.findMany({
    where: {
      status: { in: [RecordingStatus.RECORDING, RecordingStatus.UPLOADING] },
      updatedAt: { lt: staleSessionCutoff },
      deletedAt: null,
    },
    select: { id: true },
    take: payload.batchSize,
  });

  for (const recording of staleSessions) {
    stats.processed += 1;

    if (payload.dryRun) {
      stats.succeeded += 1;
      continue;
    }

    const updated = await prisma.recording.updateMany({
      where: {
        id: recording.id,
        status: { in: [RecordingStatus.RECORDING, RecordingStatus.UPLOADING] },
      },
      data: {
        status: RecordingStatus.FAILED,
        stoppedAt: new Date(),
      },
    });

    if (updated.count > 0) {
      stats.succeeded += 1;
      stats.details!.staleSessionsMarkedFailed =
        Number(stats.details!.staleSessionsMarkedFailed) + 1;
    } else {
      stats.skipped += 1;
    }
  }

  const abandonedFailed = await prisma.recording.findMany({
    where: {
      status: RecordingStatus.FAILED,
      updatedAt: { lt: failedRetentionCutoff },
      deletedAt: null,
    },
    select: {
      id: true,
      storageKey: true,
    },
    take: payload.batchSize,
  });

  const storage = getObjectStorageProvider();

  for (const recording of abandonedFailed) {
    stats.processed += 1;

    if (payload.dryRun) {
      stats.succeeded += 1;
      continue;
    }

    try {
      if (!isPendingStorageKey(recording.storageKey)) {
        const exists = await storage.objectExists(recording.storageKey);
        if (exists) {
          await storage.deleteObject(recording.storageKey);
          stats.details!.orphanObjectsDeleted = Number(stats.details!.orphanObjectsDeleted) + 1;
        }
      }

      await prisma.recording.update({
        where: { id: recording.id },
        data: {
          status: RecordingStatus.DELETED,
          deletedAt: new Date(),
        },
      });

      stats.succeeded += 1;
      stats.details!.failedMetadataCleaned = Number(stats.details!.failedMetadataCleaned) + 1;
    } catch {
      stats.failed += 1;
    }
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}

export function getDefaultCleanupFailedUploadsPayload(): CleanupFailedUploadsJobPayload {
  return cleanupFailedUploadsJobSchema.parse({
    staleSessionHours: STALE_RECORDING_SESSION_HOURS,
    failedRetentionDays: FAILED_UPLOAD_RETENTION_DAYS,
  });
}
