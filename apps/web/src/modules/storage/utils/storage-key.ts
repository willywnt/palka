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

/** Top-level object prefix for the current runtime environment. */
export function storageEnvPrefix(): 'production' | 'dev' {
  return process.env.NODE_ENV === 'production' ? 'production' : 'dev';
}

/**
 * Top-level prefixes that mark a final (uploaded, non-pending) user object.
 * `recordings` is the legacy prefix from before keys were environment-scoped —
 * kept so objects uploaded under the old layout stay owned/deletable.
 */
const USER_OBJECT_PREFIXES = ['production', 'dev', 'recordings'] as const;

/**
 * Builds an object key using:
 * {env}/{user_id}/{year}/{month}/{generated_filename}  (env = production | dev)
 */
export function generateStorageKey(
  userId: string,
  generatedFilename: string,
  date = new Date(),
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');

  return `${storageEnvPrefix()}/${userId}/${year}/${month}/${generatedFilename}`;
}

/**
 * Whether a storage key is a final object owned by `userId`. Security boundary
 * for upload completion and deletion — accepts the current env prefix and the
 * legacy `recordings/` prefix, never `pending/`.
 */
export function isUserStorageKey(storageKey: string, userId: string): boolean {
  return USER_OBJECT_PREFIXES.some((prefix) => storageKey.startsWith(`${prefix}/${userId}/`));
}

export function isPendingStorageKey(storageKey: string): boolean {
  return storageKey.startsWith('pending/');
}
