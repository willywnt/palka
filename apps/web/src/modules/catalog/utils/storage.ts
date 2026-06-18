import 'server-only';

import { appLogger } from '@/lib/logger';
import { storageService } from '@/modules/storage/services/storage.service';

/** Best-effort image delete — a failed cleanup must not fail the request. */
export async function deleteStorageObject(storageKey: string): Promise<void> {
  try {
    await storageService.deleteImageObject(storageKey);
  } catch {
    appLogger.warn('catalog.variant.image.delete_failed', { storageKey });
  }
}
