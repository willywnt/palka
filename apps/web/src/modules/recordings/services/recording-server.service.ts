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
import { extractGeneratedFilename, isUserStorageKey } from '../utils/media-recorder';
import { quotaService } from '@/modules/storage/services/quota.service';
import { storageService } from '@/modules/storage/services/storage.service';
import { appLogger } from '@/lib/logger';

const ACTIVE_STATUSES: RecordingStatus[] = [RecordingStatus.RECORDING, RecordingStatus.UPLOADING];

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

    if (recording.status !== RecordingStatus.RECORDING) {
      throw RecordingError.validation('Recording is not in a valid state.');
    }

    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: RecordingStatus.UPLOADING },
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

    if (!(ACTIVE_STATUSES as RecordingStatus[]).includes(recording.status)) {
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
        },
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

  async markFailed(recordingId: string, userId: string): Promise<void> {
    const recording = await this.getOwnedRecording(recordingId, userId);

    if (!ACTIVE_STATUSES.includes(recording.status)) {
      return;
    }

    await prisma.recording.update({
      where: { id: recordingId },
      data: { status: RecordingStatus.FAILED, stoppedAt: new Date() },
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
      where.status = { not: RecordingStatus.PENDING_DELETE };
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
        select: {
          id: true,
          noResi: true,
          status: true,
          durationSeconds: true,
          fileSizeBytes: true,
          mimeType: true,
          publicUrl: true,
          createdAt: true,
          uploadedAt: true,
        },
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

    await prisma.$transaction(async (tx) => {
      await tx.recording.update({
        where: { id: recordingId },
        data: {
          status: RecordingStatus.DELETED,
          deletedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'recording.deleted',
          resource: 'recording',
          metadata: {
            recordingId,
            noResi: recording.noResi,
          },
        },
      });
    });

    appLogger.info('recording.deleted', { userId, recordingId });
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
