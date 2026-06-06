import type { PresignUploadRequest, PresignUploadResponse } from '../types';
import { quotaService } from './quota.service';
import { storageService } from './storage.service';

export class UploadService {
  async createPresignedUpload(
    userId: string,
    request: PresignUploadRequest,
  ): Promise<PresignUploadResponse> {
    await quotaService.assertQuotaAvailable(userId, request.fileSizeBytes);

    const result = await storageService.generateUploadUrl({
      userId,
      filename: request.filename,
      mimeType: request.mimeType,
      fileSizeBytes: request.fileSizeBytes,
    });

    return {
      uploadUrl: result.uploadUrl,
      storageKey: result.storageKey,
      publicUrl: result.publicUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  /** Presign a product-image upload (counts toward the user's storage quota). */
  async createPresignedImageUpload(
    userId: string,
    request: { mimeType: string; fileSizeBytes: number },
  ): Promise<PresignUploadResponse> {
    await quotaService.assertQuotaAvailable(userId, request.fileSizeBytes);

    const result = await storageService.generateImageUploadUrl({
      userId,
      mimeType: request.mimeType,
      fileSizeBytes: request.fileSizeBytes,
    });

    return {
      uploadUrl: result.uploadUrl,
      storageKey: result.storageKey,
      publicUrl: result.publicUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  }
}

export const uploadService = new UploadService();
