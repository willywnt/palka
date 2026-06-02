export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function isRecoverableUploadError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false;
  }

  if (!isBrowserOnline()) {
    return true;
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('upload to storage failed') ||
    message.includes('upload failed') ||
    message.includes('load failed')
  );
}
