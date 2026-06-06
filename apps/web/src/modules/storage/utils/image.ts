/** Image MIME types accepted for product photos (after client-side compression). */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Hard cap for a stored product image — the client compresses well under this. */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export function isAllowedImageMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function imageExtensionForMime(mimeType: AllowedImageMimeType): string {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  return '.webp';
}
