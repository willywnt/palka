import { prisma } from '@olshop/db';
import { RECORDING_RETENTION_DAYS } from '@olshop/config/limits';
import { RecordingStatus } from '@prisma/client';
import { getObjectStorageProvider } from '@olshop/storage';

import {
  cleanupRecordingsJobSchema,
  type CleanupRecordingsJobPayload,
  type JobResultMetadata,
} from '../types/index.js';
import { isPendingStorageKey, isUserRecordingStorageKey } from '../utils/index.js';

type CleanupStats = JobResultMetadata;

async function finalizeRecordingDeletion(params: {
  recordingId: string;
  userId: string;
  storageKey: string;
  fileSizeBytes: bigint;
  dryRun: boolean;
}): Promise<'deleted' | 'skipped'> {
  const { recordingId, userId, storageKey, fileSizeBytes, dryRun } = params;
  const storage = getObjectStorageProvider();

  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
    select: { id: true, status: true, storageKey: true, fileSizeBytes: true, userId: true },
  });

  if (!recording) return 'skipped';

  if (
    recording.status !== RecordingStatus.PENDING_DELETE &&
    recording.status !== RecordingStatus.DELETED
  ) {
    return 'skipped';
  }

  if (dryRun) {
    return 'deleted';
  }

  if (!isPendingStorageKey(storageKey)) {
    try {
      await storage.deleteObject(storageKey);
    } catch {
      // Object may already be deleted — continue with DB finalization.
    }
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.recording.findUnique({
      where: { id: recordingId },
      select: { status: true, fileSizeBytes: true },
    });

    if (!current || current.status !== RecordingStatus.PENDING_DELETE) {
      return;
    }

    const shouldDecrement =
      current.fileSizeBytes > 0n && isUserRecordingStorageKey(storageKey, userId);

    await tx.recording.update({
      where: { id: recordingId },
      data: {
        status: RecordingStatus.DELETED,
        deletedAt: new Date(),
      },
    });

    if (shouldDecrement) {
      await tx.user.update({
        where: { id: userId },
        data: {
          storageUsedBytes: {
            decrement: current.fileSizeBytes,
          },
        },
      });
    }
  });

  return 'deleted';
}

export async function processCleanupRecordingsJob(
  rawPayload: CleanupRecordingsJobPayload,
): Promise<CleanupStats> {
  const startedAt = Date.now();
  const payload = cleanupRecordingsJobSchema.parse(rawPayload);
  const cutoff = new Date(Date.now() - payload.retentionDays * 24 * 60 * 60 * 1000);

  const stats: CleanupStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    details: {
      markedPendingDelete: 0,
      finalized: 0,
    },
  };

  const expiredCompleted = await prisma.recording.findMany({
    where: {
      status: RecordingStatus.COMPLETED,
      deletedAt: null,
      uploadedAt: { lt: cutoff },
    },
    select: {
      id: true,
      userId: true,
      storageKey: true,
      fileSizeBytes: true,
    },
    orderBy: { uploadedAt: 'asc' },
    take: payload.batchSize,
  });

  for (const recording of expiredCompleted) {
    stats.processed += 1;

    if (payload.dryRun) {
      stats.succeeded += 1;
      continue;
    }

    const updated = await prisma.recording.updateMany({
      where: {
        id: recording.id,
        status: RecordingStatus.COMPLETED,
      },
      data: {
        status: RecordingStatus.PENDING_DELETE,
      },
    });

    if (updated.count === 0) {
      stats.skipped += 1;
      continue;
    }

    stats.details!.markedPendingDelete = Number(stats.details!.markedPendingDelete) + 1;

    try {
      const result = await finalizeRecordingDeletion({
        recordingId: recording.id,
        userId: recording.userId,
        storageKey: recording.storageKey,
        fileSizeBytes: recording.fileSizeBytes,
        dryRun: false,
      });

      if (result === 'deleted') {
        stats.succeeded += 1;
        stats.details!.finalized = Number(stats.details!.finalized) + 1;
      } else {
        stats.skipped += 1;
      }
    } catch {
      stats.failed += 1;
    }
  }

  const pendingDeleteBatch = await prisma.recording.findMany({
    where: {
      status: RecordingStatus.PENDING_DELETE,
    },
    select: {
      id: true,
      userId: true,
      storageKey: true,
      fileSizeBytes: true,
    },
    take: payload.batchSize,
  });

  for (const recording of pendingDeleteBatch) {
    stats.processed += 1;

    try {
      const result = await finalizeRecordingDeletion({
        recordingId: recording.id,
        userId: recording.userId,
        storageKey: recording.storageKey,
        fileSizeBytes: recording.fileSizeBytes,
        dryRun: payload.dryRun,
      });

      if (result === 'deleted') {
        stats.succeeded += 1;
        stats.details!.finalized = Number(stats.details!.finalized) + 1;
      } else {
        stats.skipped += 1;
      }
    } catch {
      stats.failed += 1;
    }
  }

  const softDeletedWithoutCleanup = await prisma.recording.findMany({
    where: {
      status: RecordingStatus.DELETED,
      deletedAt: { not: null },
      NOT: {
        storageKey: { startsWith: 'pending/' },
      },
    },
    select: {
      id: true,
      userId: true,
      storageKey: true,
      fileSizeBytes: true,
    },
    take: payload.batchSize,
  });

  for (const recording of softDeletedWithoutCleanup) {
    stats.processed += 1;

    if (payload.dryRun) {
      stats.succeeded += 1;
      continue;
    }

    try {
      if (!isPendingStorageKey(recording.storageKey)) {
        await getObjectStorageProvider().deleteObject(recording.storageKey);
      }

      stats.succeeded += 1;
    } catch {
      stats.failed += 1;
    }
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}

export function getDefaultCleanupRecordingsPayload(): CleanupRecordingsJobPayload {
  return cleanupRecordingsJobSchema.parse({
    retentionDays: RECORDING_RETENTION_DAYS,
  });
}
