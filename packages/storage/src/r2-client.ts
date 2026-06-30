import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getServerEnv } from '@palka/config/env.server';

import type { ObjectStorageConfig, ObjectStorageProvider } from './types.js';

function getObjectStorageConfig(): ObjectStorageConfig {
  const env = getServerEnv();

  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_RECORDINGS_BUCKET_NAME,
  };
}

function createS3Client(config: ObjectStorageConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export class R2ObjectStorageProvider implements ObjectStorageProvider {
  private readonly client: S3Client;
  private readonly bucketName: string;

  constructor(config: ObjectStorageConfig, client?: S3Client) {
    this.bucketName = config.bucketName;
    this.client = client ?? createS3Client(config);
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      }),
    );
  }

  async objectExists(storageKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async listObjectKeys(prefix: string, maxKeys = 500): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      }),
    );

    return (response.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));
  }

  async checkAvailability(): Promise<boolean> {
    try {
      // HeadBucket is a Class B op on R2; a bucket LIST would be Class A. The health
      // snapshot is polled frequently (container probe), so the cheaper op matters —
      // it only needs to confirm the bucket is reachable, not enumerate keys.
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucketName,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

let cachedProvider: R2ObjectStorageProvider | undefined;

export function getObjectStorageProvider(): R2ObjectStorageProvider {
  if (!cachedProvider) {
    cachedProvider = new R2ObjectStorageProvider(getObjectStorageConfig());
  }

  return cachedProvider;
}
