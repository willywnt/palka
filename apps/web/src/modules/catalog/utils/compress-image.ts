function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resize + compress an image in the browser before upload: scaled to fit
 * `maxDimension` (default 1600px) and re-encoded as WebP (~0.8), with a JPEG
 * fallback. Keeps product photos well under the storage cap.
 */
export async function compressImage(
  file: File,
  options: { maxDimension?: number; quality?: number } = {},
): Promise<Blob> {
  const maxDimension = options.maxDimension ?? 1600;
  const quality = options.quality ?? 0.8;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Image compression is not supported in this browser.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp) return webp;

  const jpeg = await toBlob(canvas, 'image/jpeg', quality);
  if (jpeg) return jpeg;

  throw new Error('Image compression failed.');
}
