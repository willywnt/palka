import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerEnv } from '@olshop/config/env.server';
import {
  PRESIGNED_ACCESS_EXPIRY_SECONDS,
  PRESIGNED_UPLOAD_EXPIRY_SECONDS,
} from '@olshop/config/limits';
import { buildPublicUrl } from '@olshop/utils/storage';

import { StorageError } from '../errors/storage-errors';
import type {
  GenerateAccessUrlParams,
  GenerateAccessUrlResult,
  PresignedUploadParams,
  PresignedUploadResult,
  StorageProvider,
  StorageProviderConfig,
} from '../types';

function getStorageConfig(): StorageProviderConfig {
  const env = getServerEnv();

  if (!env.R2_PUBLIC_URL) {
    throw StorageError.unavailable('R2_PUBLIC_URL is not configured');
  }

  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_RECORDINGS_BUCKET_NAME,
    publicBaseUrl: env.R2_PUBLIC_URL,
    uploadExpirySeconds: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    accessExpirySeconds: PRESIGNED_ACCESS_EXPIRY_SECONDS,
  };
}

/** Config for the separate, public product-image bucket (its own public r2.dev/custom domain). */
function getProductImageConfig(): StorageProviderConfig {
  const env = getServerEnv();

  if (!env.R2_PRODUCTS_BUCKET_NAME) {
    throw StorageError.unavailable('R2_PRODUCTS_BUCKET_NAME is not configured');
  }
  if (!env.R2_PRODUCTS_PUBLIC_URL) {
    throw StorageError.unavailable('R2_PRODUCTS_PUBLIC_URL is not configured');
  }

  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_PRODUCTS_BUCKET_NAME,
    publicBaseUrl: env.R2_PRODUCTS_PUBLIC_URL,
    uploadExpirySeconds: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
    accessExpirySeconds: PRESIGNED_ACCESS_EXPIRY_SECONDS,
  };
}

function createR2Client(config: StorageProviderConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Browser uploads cannot satisfy SDK checksum headers embedded in presigned URLs.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly config: StorageProviderConfig;

  constructor(config: StorageProviderConfig, client?: S3Client) {
    this.config = config;
    this.client = client ?? createR2Client(config);
  }

  async generateUploadUrl(params: PresignedUploadParams): Promise<PresignedUploadResult> {
    const expiresAt = new Date(Date.now() + this.config.uploadExpirySeconds * 1000);

    const command = new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: params.storageKey,
      ContentType: params.mimeType,
    });

    try {
      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: this.config.uploadExpirySeconds,
        // Only sign Content-Type so browser PUT requests match the signature.
        signableHeaders: new Set(['content-type']),
      });

      return { uploadUrl, expiresAt };
    } catch (error) {
      throw StorageError.unavailable(
        error instanceof Error ? error.message : 'Failed to generate upload URL',
      );
    }
  }

  async generateAccessUrl(params: GenerateAccessUrlParams): Promise<GenerateAccessUrlResult> {
    const expiresAt = new Date(Date.now() + this.config.accessExpirySeconds * 1000);
    const disposition =
      params.disposition === 'attachment' && params.filename
        ? `attachment; filename="${params.filename.replace(/"/g, '')}"`
        : 'inline';

    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: params.storageKey,
      ResponseContentType: params.mimeType,
      ResponseContentDisposition: disposition,
    });

    try {
      const url = await getSignedUrl(this.client, command, {
        expiresIn: this.config.accessExpirySeconds,
      });

      return { url, expiresAt };
    } catch (error) {
      throw StorageError.unavailable(
        error instanceof Error ? error.message : 'Failed to generate access URL',
      );
    }
  }

  getPublicUrl(storageKey: string): string {
    return buildPublicUrl(this.config.publicBaseUrl, storageKey);
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucketName,
          Key: storageKey,
        }),
      );
    } catch (error) {
      throw StorageError.unavailable(
        error instanceof Error ? error.message : 'Failed to delete object',
      );
    }
  }
}

let cachedProvider: R2StorageProvider | undefined;

export function getR2StorageProvider(): R2StorageProvider {
  if (!cachedProvider) {
    cachedProvider = new R2StorageProvider(getStorageConfig());
  }

  return cachedProvider;
}

let cachedProductImageProvider: R2StorageProvider | undefined;

/** Lazily-built provider for the public product-image bucket (configured separately). */
export function getR2ProductImageProvider(): R2StorageProvider {
  if (!cachedProductImageProvider) {
    cachedProductImageProvider = new R2StorageProvider(getProductImageConfig());
  }

  return cachedProductImageProvider;
}
