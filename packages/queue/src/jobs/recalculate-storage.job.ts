import { prisma } from '@falka/db';
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
      repairedOrganizations: 0,
      unchangedOrganizations: 0,
    },
  };

  const organizations = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      ...(payload.organizationId ? { id: payload.organizationId } : {}),
    },
    select: {
      id: true,
      storageUsedBytes: true,
    },
    take: payload.batchSize,
    orderBy: { updatedAt: 'asc' },
  });

  for (const organization of organizations) {
    stats.processed += 1;

    // The org's storage footprint = COMPLETED recordings + every product/bundle photo.
    // Recordings free their R2 object + quota on soft-delete, so they're filtered to
    // non-deleted; product/bundle images persist through archive (kept for restore), so
    // their bytes are summed wherever an imageSizeBytes is set, regardless of deletedAt.
    const [recordingAgg, variantImageAgg, bundleImageAgg] = await Promise.all([
      prisma.recording.aggregate({
        where: {
          organizationId: organization.id,
          status: RecordingStatus.COMPLETED,
          deletedAt: null,
        },
        _sum: { fileSizeBytes: true },
      }),
      prisma.productVariant.aggregate({
        where: { organizationId: organization.id },
        _sum: { imageSizeBytes: true },
      }),
      prisma.bundle.aggregate({
        where: { organizationId: organization.id },
        _sum: { imageSizeBytes: true },
      }),
    ]);

    const calculatedUsed =
      (recordingAgg._sum.fileSizeBytes ?? 0n) +
      (variantImageAgg._sum.imageSizeBytes ?? 0n) +
      (bundleImageAgg._sum.imageSizeBytes ?? 0n);
    const currentUsed = organization.storageUsedBytes;

    if (calculatedUsed === currentUsed) {
      stats.skipped += 1;
      stats.details!.unchangedOrganizations = Number(stats.details!.unchangedOrganizations) + 1;
      continue;
    }

    if (payload.dryRun) {
      stats.succeeded += 1;
      stats.details!.repairedOrganizations = Number(stats.details!.repairedOrganizations) + 1;
      continue;
    }

    try {
      await prisma.organization.update({
        where: { id: organization.id },
        data: {
          storageUsedBytes: calculatedUsed,
        },
      });

      stats.succeeded += 1;
      stats.details!.repairedOrganizations = Number(stats.details!.repairedOrganizations) + 1;
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
