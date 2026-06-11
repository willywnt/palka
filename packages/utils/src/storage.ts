export interface StorageObjectMetadata {
  key: string;
  sizeBytes: number;
  contentType: string;
  lastModified: Date;
}

export interface PresignedUploadUrl {
  uploadUrl: string;
  storageKey: string;
  expiresAt: Date;
}

export function buildPublicUrl(baseUrl: string, storageKey: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedKey = storageKey.replace(/^\//, '');
  return `${normalizedBase}/${normalizedKey}`;
}

export function parseStorageKeyFromUrl(url: string, baseUrl: string): string | null {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  if (!url.startsWith(normalizedBase)) return null;
  return url.slice(normalizedBase.length + 1);
}

export function isWithinQuota(
  usedBytes: number,
  quotaBytes: number,
  additionalBytes: number,
): boolean {
  return usedBytes + additionalBytes <= quotaBytes;
}

export function remainingQuotaBytes(usedBytes: number, quotaBytes: number): number {
  return Math.max(0, quotaBytes - usedBytes);
}

export function quotaUsagePercent(usedBytes: number, quotaBytes: number): number {
  // 0 quota = not provisioned yet — display as empty, not as an alarming "full"
  // (upload enforcement goes through isWithinQuota, which still blocks at 0).
  if (quotaBytes === 0) return 0;
  return Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
}
