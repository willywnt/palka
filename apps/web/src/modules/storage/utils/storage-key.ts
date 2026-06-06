import { generateId } from '@olshop/utils/crypto';

/**
 * Generates a unique recording filename.
 * Example: rec_20260527_a1b2c3d4.webm
 */
export function generateRecordingFilename(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const uniqueId = generateId(8);

  return `rec_${year}${month}${day}_${uniqueId}.webm`;
}

/**
 * Generates a unique product-image filename.
 * Example: img_20260606_a1b2c3d4.webp
 */
export function generateImageFilename(extension: string, date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const uniqueId = generateId(8);

  return `img_${year}${month}${day}_${uniqueId}${extension}`;
}

/** Builds a recording object key: {user_id}/{year}/{month}/{generated_filename}. */
export function generateStorageKey(
  userId: string,
  generatedFilename: string,
  date = new Date(),
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');

  return `${userId}/${year}/${month}/${generatedFilename}`;
}

/** Builds a product-image object key: {user_id}/{generated_filename} (flat, no date). */
export function generateProductImageKey(userId: string, generatedFilename: string): string {
  return `${userId}/${generatedFilename}`;
}

/**
 * Whether a storage key is a final object owned by `userId`. Security boundary for
 * upload completion and deletion. The trailing slash blocks user-id prefix injection.
 */
export function isUserStorageKey(storageKey: string, userId: string): boolean {
  return storageKey.startsWith(`${userId}/`);
}

export function isPendingStorageKey(storageKey: string): boolean {
  return storageKey.startsWith('pending/');
}
