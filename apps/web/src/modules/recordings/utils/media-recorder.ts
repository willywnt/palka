import {
  RECORDING_BITRATE_BPS,
  RECORDING_FPS,
  RECORDING_HEIGHT,
  RECORDING_MIME_TYPE,
  RECORDING_WIDTH,
} from '@olshop/config/limits';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  RECORDING_MIME_TYPE,
] as const;

export function isMediaRecorderSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
}

export function getSupportedRecordingMimeType(): string | null {
  if (!isMediaRecorderSupported()) return null;

  for (const mimeType of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
}

/** Normalize browser codec-specific WebM types to the canonical upload MIME type. */
export function normalizeRecordingMimeType(mimeType: string): typeof RECORDING_MIME_TYPE {
  const baseType = mimeType.split(';')[0]?.trim().toLowerCase();

  if (baseType === RECORDING_MIME_TYPE) {
    return RECORDING_MIME_TYPE;
  }

  throw new Error(`Unsupported recording MIME type: ${mimeType}`);
}

export function getRecordingConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      width: { ideal: RECORDING_WIDTH },
      height: { ideal: RECORDING_HEIGHT },
      frameRate: { ideal: RECORDING_FPS },
    },
    audio: true,
  };
}

export function getMediaRecorderOptions(mimeType: string): MediaRecorderOptions {
  return {
    mimeType,
    videoBitsPerSecond: RECORDING_BITRATE_BPS,
  };
}

export function estimateRecordingFileSizeBytes(durationSeconds: number): number {
  return Math.round((RECORDING_BITRATE_BPS / 8) * Math.max(durationSeconds, 0));
}

export function extractGeneratedFilename(storageKey: string): string {
  const segments = storageKey.split('/');
  return segments[segments.length - 1] ?? storageKey;
}

export function isUserStorageKey(storageKey: string, userId: string): boolean {
  return storageKey.startsWith(`recordings/${userId}/`);
}

export function blobToUploadFile(blob: Blob, filename: string): File {
  return new File([blob], filename, {
    type: normalizeRecordingMimeType(blob.type || RECORDING_MIME_TYPE),
    lastModified: Date.now(),
  });
}
