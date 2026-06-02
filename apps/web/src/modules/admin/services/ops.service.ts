import 'server-only';

import { STALE_RECORDING_SESSION_HOURS } from '@olshop/config/limits';
import { prisma } from '@olshop/db';
import { getMetricsSnapshot } from '@olshop/metrics';
import { getFailedJobsSummary, getQueueObservabilitySnapshot } from '@olshop/queue';
import { getObjectStorageProvider } from '@olshop/storage';

export async function getFailedUploadsReport(limit = 50) {
  // Computed per request — a module-level constant would freeze the cutoff at
  // process start, so long-lived servers would drift.
  const staleThreshold = new Date(Date.now() - STALE_RECORDING_SESSION_HOURS * 60 * 60 * 1000);

  return prisma.recording.findMany({
    where: {
      OR: [{ status: 'FAILED' }, { status: 'UPLOADING', updatedAt: { lt: staleThreshold } }],
    },
    select: {
      id: true,
      userId: true,
      status: true,
      storageKey: true,
      noResi: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}

export async function getOrphanRecordingsReport(limit = 50) {
  const candidates = await prisma.recording.findMany({
    where: {
      status: { in: ['COMPLETED', 'UPLOADING', 'PENDING_DELETE'] },
    },
    select: {
      id: true,
      storageKey: true,
      status: true,
      userId: true,
      updatedAt: true,
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });

  const storage = getObjectStorageProvider();
  const orphans = [];

  for (const recording of candidates) {
    if (!recording.storageKey) continue;
    const exists = await storage.objectExists(recording.storageKey);
    if (!exists) {
      orphans.push({
        ...recording,
        issue: 'metadata_without_storage_object' as const,
        suggestion: 'Review before repair; storage object is missing.',
      });
    }
  }

  return orphans;
}

export async function getStuckJobsReport() {
  return getFailedJobsSummary(50);
}

export async function getStorageMismatchReport(limit = 50) {
  const storage = getObjectStorageProvider();
  const keys = await storage.listObjectKeys('recordings/', limit);
  const mismatches = [];

  for (const storageKey of keys) {
    const recording = await prisma.recording.findFirst({
      where: { storageKey },
      select: { id: true, status: true, userId: true },
    });

    if (!recording) {
      mismatches.push({
        storageKey,
        issue: 'storage_object_without_metadata' as const,
        suggestion: 'Review before deletion; no DB row references this object.',
      });
    }
  }

  return mismatches;
}

export async function getOperationalMetricsReport() {
  const [metrics, queues] = await Promise.all([
    getMetricsSnapshot(),
    getQueueObservabilitySnapshot().catch(() => []),
  ]);

  return { metrics, queues };
}
