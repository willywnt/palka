import 'server-only';

import { buildPaginatedResult, prisma } from '@olshop/db';
import { getServerEnv } from '@olshop/config/env.server';
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } from '@olshop/config/limits';
import { generateId } from '@olshop/utils/crypto';
import { RecordingStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { RecordingError } from '../errors/recording-errors';
import type { PaginatedRecordingsResponse, RecordingDetail, RecordingListItem } from '../types';
import type { ListRecordingsQuery } from '../validators/list-recordings';
import type { SaveRecordingMetadataInput } from '../validators/create-recording';
import { extractGeneratedFilename } from '../utils/media-recorder';
import { isPendingStorageKey, isUserStorageKey } from '@/modules/storage/utils/storage-key';
import { quotaService } from '@/modules/storage/services/quota.service';
import { storageService } from '@/modules/storage/services/storage.service';
import { appLogger } from '@/lib/logger';

const ACTIVE_STATUSES: RecordingStatus[] = [RecordingStatus.RECORDING, RecordingStatus.UPLOADING];

/** Server sessions that can receive a retried upload after local recovery. */
const UPLOAD_RESUMABLE_STATUSES: RecordingStatus[] = [
  RecordingStatus.RECORDING,
  RecordingStatus.UPLOADING,
  RecordingStatus.FAILED,
];

const CANCELLABLE_STATUSES: RecordingStatus[] = [
  RecordingStatus.RECORDING,
  RecordingStatus.UPLOADING,
  RecordingStatus.FAILED,
];

/** Window in which a same-resi recording counts as a duplicate worth warning about. */
const DUPLICATE_RESI_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Columns selected for a RecordingListItem (shared by list + duplicate lookup). */
const RECORDING_LIST_ITEM_SELECT = {
  id: true,
  noResi: true,
  status: true,
  durationSeconds: true,
  fileSizeBytes: true,
  mimeType: true,
  publicUrl: true,
  createdAt: true,
  uploadedAt: true,
} as const satisfies Prisma.RecordingSelect;

function mapListItem(recording: {
  id: string;
  noResi: string;
  status: RecordingStatus;
  durationSeconds: number;
  fileSizeBytes: bigint;
  mimeType: string;
  publicUrl: string;
  createdAt: Date;
  uploadedAt: Date | null;
}): RecordingListItem {
  return {
    id: recording.id,
    noResi: recording.noResi,
    status: recording.status,
    durationSeconds: recording.durationSeconds,
    fileSizeBytes: Number(recording.fileSizeBytes),
    mimeType: recording.mimeType,
    publicUrl: recording.publicUrl,
    createdAt: recording.createdAt.toISOString(),
    uploadedAt: recording.uploadedAt?.toISOString() ?? null,
  };
}

function mapDetail(recording: {
  id: string;
  noResi: string;
  status: RecordingStatus;
  durationSeconds: number;
  fileSizeBytes: bigint;
  mimeType: string;
  publicUrl: string;
  storageProvider: string;
  generatedFilename: string;
  failureCode?: string | null;
  failureReason?: string | null;
  startedAt: Date;
  stoppedAt: Date | null;
  uploadedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RecordingDetail {
  return {
    id: recording.id,
    noResi: recording.noResi,
    status: recording.status,
    durationSeconds: recording.durationSeconds,
    fileSizeBytes: Number(recording.fileSizeBytes),
    mimeType: recording.mimeType,
    publicUrl: recording.publicUrl,
    storageProvider: recording.storageProvider,
    generatedFilename: recording.generatedFilename,
    failureCode: recording.failureCode ?? null,
    failureReason: recording.failureReason ?? null,
    startedAt: recording.startedAt.toISOString(),
    stoppedAt: recording.stoppedAt?.toISOString() ?? null,
    uploadedAt: recording.uploadedAt?.toISOString() ?? null,
    createdAt: recording.createdAt.toISOString(),
    updatedAt: recording.updatedAt.toISOString(),
  };
}

export class RecordingServerService {
  async findActiveRecording(userId: string) {
    return prisma.recording.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assertNoActiveRecording(userId: string): Promise<void> {
    const active = await this.findActiveRecording(userId);

    if (active) {
      throw RecordingError.activeRecordingExists();
    }
  }

  async startRecording(userId: string, noResi: string) {
    await this.assertNoActiveRecording(userId);

    const snapshot = await quotaService.getQuotaSnapshot(userId);
    if (Number(snapshot.remainingBytes) <= 0) {
      throw RecordingError.quotaExceeded();
    }

    const env = getServerEnv();
    const pendingKey = `pending/${userId}/${generateId(12)}`;

    const recording = await prisma.recording.create({
      data: {
        userId,
        noResi,
        generatedFilename: 'pending.webm',
        storageProvider: 'cloudflare-r2',
        storageBucket: env.R2_BUCKET_NAME,
        storageKey: pendingKey,
        publicUrl: 'pending',
        mimeType: ALLOWED_UPLOAD_MIME_TYPES[0],
        fileSizeBytes: BigInt(0),
        durationSeconds: 0,
        status: RecordingStatus.RECORDING,
        startedAt: new Date(),
      },
    });

    return {
      recordingId: recording.id,
      noResi: recording.noResi,
      startedAt: recording.startedAt.toISOString(),
    };
  }

  async markUploading(recordingId: string, userId: string): Promise<void> {
    const recording = await this.getOwnedRecording(recordingId, userId);

    if (recording.status === RecordingStatus.UPLOADING) {
      return;
    }

    if (!UPLOAD_RESUMABLE_STATUSES.includes(recording.status)) {
      throw RecordingError.validation('Recording is not in a valid state.');
    }

    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: RecordingStatus.UPLOADING,
        failureCode: null,
        failureReason: null,
      } as Prisma.RecordingUpdateInput,
    });
  }

  async completeRecording(userId: string, input: SaveRecordingMetadataInput) {
    if (!isUserStorageKey(input.storageKey, userId)) {
      throw RecordingError.validation('Invalid storage key for this user.');
    }

    if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
      throw RecordingError.validation('Unsupported MIME type.');
    }

    if (input.fileSizeBytes <= 0 || input.fileSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
      throw RecordingError.validation('Invalid file size.');
    }

    await quotaService.assertQuotaAvailable(userId, input.fileSizeBytes);

    const recording = await this.getOwnedRecording(input.recordingId, userId);

    if (!UPLOAD_RESUMABLE_STATUSES.includes(recording.status)) {
      throw RecordingError.validation('Recording is not in a valid state.');
    }

    if (recording.noResi !== input.noResi) {
      throw RecordingError.validation('Resi number mismatch.');
    }

    const existingKey = await prisma.recording.findUnique({
      where: { storageKey: input.storageKey },
      select: { id: true },
    });

    if (existingKey && existingKey.id !== input.recordingId) {
      throw RecordingError.validation('Storage key already exists.');
    }

    const generatedFilename = extractGeneratedFilename(input.storageKey);
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.recording.update({
        where: { id: input.recordingId },
        data: {
          noResi: input.noResi,
          generatedFilename,
          storageKey: input.storageKey,
          publicUrl: input.publicUrl,
          mimeType: input.mimeType,
          fileSizeBytes: BigInt(input.fileSizeBytes),
          durationSeconds: input.durationSeconds,
          status: RecordingStatus.COMPLETED,
          stoppedAt: now,
          uploadedAt: now,
          failureCode: null,
          failureReason: null,
        } as Prisma.RecordingUpdateInput,
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          storageUsedBytes: {
            increment: BigInt(input.fileSizeBytes),
          },
        },
      });

      return saved;
    });

    return {
      id: updated.id,
      noResi: updated.noResi,
      status: updated.status,
      publicUrl: updated.publicUrl,
      storageKey: updated.storageKey,
      fileSizeBytes: Number(updated.fileSizeBytes),
      durationSeconds: updated.durationSeconds,
    };
  }

  async markFailed(
    recordingId: string,
    userId: string,
    options?: { failureCode?: string; failureReason?: string },
  ): Promise<void> {
    const recording = await this.getOwnedRecording(recordingId, userId);

    if (!CANCELLABLE_STATUSES.includes(recording.status)) {
      return;
    }

    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: RecordingStatus.FAILED,
        stoppedAt: recording.stoppedAt ?? new Date(),
        failureCode: options?.failureCode ?? null,
        failureReason: options?.failureReason ?? null,
      } as Prisma.RecordingUpdateInput,
    });
  }

  async listRecordings(
    userId: string,
    query: ListRecordingsQuery,
  ): Promise<PaginatedRecordingsResponse> {
    const where: Prisma.RecordingWhereInput = {
      userId,
      deletedAt: null,
    };

    if (query.status !== 'ALL') {
      where.status = query.status;
    } else {
      where.status = {
        notIn: [
          RecordingStatus.PENDING_DELETE,
          RecordingStatus.RECORDING,
          RecordingStatus.UPLOADING,
        ],
      };
    }

    if (query.search) {
      where.noResi = {
        contains: query.search,
        mode: 'insensitive',
      };
    }

    const orderBy: Prisma.RecordingOrderByWithRelationInput = {
      [query.sortBy]: query.sortOrder,
    };

    const [total, recordings] = await prisma.$transaction([
      prisma.recording.count({ where }),
      prisma.recording.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: RECORDING_LIST_ITEM_SELECT,
      }),
    ]);

    const result = buildPaginatedResult(
      recordings.map(mapListItem),
      total,
      query.page,
      query.pageSize,
    );

    return {
      items: result.items,
      meta: result.meta,
    };
  }

  /**
   * The most recent non-deleted recording with the EXACT same resi within the
   * lookback window — including in-progress (RECORDING/UPLOADING) sessions, so a
   * resi being recorded right now is still flagged as a duplicate.
   */
  async findRecentDuplicateResi(userId: string, noResi: string): Promise<RecordingListItem | null> {
    const since = new Date(Date.now() - DUPLICATE_RESI_LOOKBACK_MS);

    const recording = await prisma.recording.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: { notIn: [RecordingStatus.PENDING_DELETE] },
        noResi: { equals: noResi, mode: 'insensitive' },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      select: RECORDING_LIST_ITEM_SELECT,
    });

    return recording ? mapListItem(recording) : null;
  }

  /**
   * Completed packing videos for an EXACT tracking number — the order/return
   * dispute evidence. Newest first; excludes soft-deleted.
   */
  async findByResi(userId: string, noResi: string): Promise<RecordingListItem[]> {
    const recordings = await prisma.recording.findMany({
      where: {
        userId,
        deletedAt: null,
        status: RecordingStatus.COMPLETED,
        noResi: { equals: noResi, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      select: RECORDING_LIST_ITEM_SELECT,
    });

    return recordings.map(mapListItem);
  }

  async getRecordingById(userId: string, recordingId: string): Promise<RecordingDetail> {
    const recording = await prisma.recording.findFirst({
      where: {
        id: recordingId,
        userId,
        deletedAt: null,
      },
    });

    if (!recording) {
      throw RecordingError.validation('Recording not found.');
    }

    await this.logRecordingAccess(userId, recordingId, 'recording.viewed');

    return mapDetail(recording);
  }

  async getPlaybackInfo(userId: string, recordingId: string) {
    const recording = await this.getOwnedRecording(recordingId, userId);

    if (recording.status !== RecordingStatus.COMPLETED) {
      throw RecordingError.validation('Recording is not available for playback.');
    }

    if (!recording.storageKey) {
      throw RecordingError.validation('Recording file is unavailable.');
    }

    const access = await storageService.generateAccessUrl({
      storageKey: recording.storageKey,
      mimeType: recording.mimeType,
      disposition: 'inline',
    });

    await this.logRecordingAccess(userId, recordingId, 'recording.playback');

    return {
      playbackUrl: access.url,
      expiresAt: access.expiresAt.toISOString(),
      mimeType: recording.mimeType,
    };
  }

  async getDownloadInfo(userId: string, recordingId: string) {
    const recording = await this.getOwnedRecording(recordingId, userId);

    if (recording.status !== RecordingStatus.COMPLETED) {
      throw RecordingError.validation('Recording is not available for download.');
    }

    if (!recording.storageKey) {
      throw RecordingError.validation('Recording file is unavailable.');
    }

    const access = await storageService.generateAccessUrl({
      storageKey: recording.storageKey,
      mimeType: recording.mimeType,
      disposition: 'attachment',
      filename: recording.generatedFilename,
    });

    await this.logRecordingAccess(userId, recordingId, 'recording.downloaded');

    return {
      downloadUrl: access.url,
      filename: recording.generatedFilename,
      mimeType: recording.mimeType,
      expiresAt: access.expiresAt.toISOString(),
    };
  }

  async softDeleteRecording(userId: string, recordingId: string): Promise<void> {
    const recording = await this.getOwnedRecording(recordingId, userId);

    if (recording.status === RecordingStatus.DELETED) {
      return;
    }

    const shouldDeleteObject = !isPendingStorageKey(recording.storageKey);
    const shouldDecrementQuota =
      recording.status === RecordingStatus.COMPLETED &&
      recording.fileSizeBytes > 0n &&
      isUserStorageKey(recording.storageKey, userId);

    if (shouldDeleteObject) {
      try {
        await storageService.deleteObject(recording.storageKey);
      } catch (error) {
        appLogger.warn('recording.delete.storage_object_failed', {
          userId,
          recordingId,
          storageKey: recording.storageKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.recording.update({
        where: { id: recordingId },
        data: {
          status: RecordingStatus.DELETED,
          deletedAt: new Date(),
        },
      });

      if (shouldDecrementQuota) {
        await tx.user.update({
          where: { id: userId },
          data: {
            storageUsedBytes: {
              decrement: recording.fileSizeBytes,
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'recording.deleted',
          resource: 'recording',
          metadata: {
            recordingId,
            noResi: recording.noResi,
            storageKey: recording.storageKey,
            fileSizeBytes: Number(recording.fileSizeBytes),
            storageObjectDeleted: shouldDeleteObject,
            quotaDecremented: shouldDecrementQuota,
          },
        },
      });
    });

    appLogger.info('recording.deleted', {
      userId,
      recordingId,
      storageKey: recording.storageKey,
      storageObjectDeleted: shouldDeleteObject,
      quotaDecremented: shouldDecrementQuota,
    });
  }

  private async logRecordingAccess(userId: string, recordingId: string, action: string) {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource: 'recording',
        metadata: { recordingId },
      },
    });
  }

  private async getOwnedRecording(recordingId: string, userId: string) {
    const recording = await prisma.recording.findFirst({
      where: {
        id: recordingId,
        userId,
        deletedAt: null,
      },
    });

    if (!recording) {
      throw RecordingError.validation('Recording not found.');
    }

    return recording;
  }
}

export const recordingServerService = new RecordingServerService();
