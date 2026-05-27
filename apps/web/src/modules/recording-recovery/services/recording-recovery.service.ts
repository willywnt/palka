import {
  RECORDING_RECOVERY_CONFIG,
  type RecoveryUploadStatus,
  type SaveTemporaryRecordingInput,
  type TemporaryRecording,
} from '../types';
import { ReliabilityError } from '../errors/reliability-errors';
import {
  idbRequest,
  idbTransactionComplete,
  isIndexedDbSupported,
  openDatabase,
} from '../utils/idb-client';

type StoredTemporaryRecording = TemporaryRecording & {
  blob: Blob;
};

function createId(): string {
  return crypto.randomUUID();
}

function ensureStore(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(RECORDING_RECOVERY_CONFIG.storeName)) {
    const store = db.createObjectStore(RECORDING_RECOVERY_CONFIG.storeName, { keyPath: 'id' });
    store.createIndex('uploadStatus', 'uploadStatus', { unique: false });
    store.createIndex('createdAt', 'createdAt', { unique: false });
  }
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase(
    RECORDING_RECOVERY_CONFIG.dbName,
    RECORDING_RECOVERY_CONFIG.dbVersion,
    ensureStore,
  );

  try {
    const transaction = db.transaction(RECORDING_RECOVERY_CONFIG.storeName, mode);
    const store = transaction.objectStore(RECORDING_RECOVERY_CONFIG.storeName);
    const result = await handler(store);
    await idbTransactionComplete(transaction);
    return result;
  } finally {
    db.close();
  }
}

function toTemporaryRecording(record: StoredTemporaryRecording): TemporaryRecording {
  return {
    id: record.id,
    recordingId: record.recordingId,
    noResi: record.noResi,
    mimeType: record.mimeType,
    durationSeconds: record.durationSeconds,
    estimatedSizeBytes: record.estimatedSizeBytes,
    createdAt: record.createdAt,
    uploadStatus: record.uploadStatus,
    failureReason: record.failureReason,
  };
}

export class RecordingRecoveryService {
  isAvailable(): boolean {
    return isIndexedDbSupported();
  }

  async saveTemporaryRecording(input: SaveTemporaryRecordingInput): Promise<TemporaryRecording> {
    const record: StoredTemporaryRecording = {
      id: createId(),
      recordingId: input.recordingId ?? null,
      noResi: input.noResi,
      blob: input.blob,
      mimeType: input.mimeType,
      durationSeconds: input.durationSeconds,
      estimatedSizeBytes: input.blob.size,
      createdAt: new Date().toISOString(),
      uploadStatus: input.uploadStatus ?? 'PENDING',
      failureReason: input.failureReason ?? null,
    };

    await withStore('readwrite', async (store) => {
      await idbRequest(store.put(record));
    });

    return toTemporaryRecording(record);
  }

  async getTemporaryRecordings(): Promise<TemporaryRecording[]> {
    if (!this.isAvailable()) return [];

    const records = await withStore('readonly', async (store) => {
      return idbRequest(store.getAll()) as Promise<StoredTemporaryRecording[]>;
    });

    return records
      .filter((record) => record.uploadStatus !== 'COMPLETED')
      .map(toTemporaryRecording)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTemporaryRecordingBlob(id: string): Promise<Blob | null> {
    const record = await withStore('readonly', async (store) => {
      return idbRequest(store.get(id)) as Promise<StoredTemporaryRecording | undefined>;
    });

    return record?.blob ?? null;
  }

  async getTemporaryRecordingWithBlob(id: string): Promise<StoredTemporaryRecording | null> {
    const record = await withStore('readonly', async (store) => {
      return idbRequest(store.get(id)) as Promise<StoredTemporaryRecording | undefined>;
    });

    return record ?? null;
  }

  async updateUploadStatus(
    id: string,
    uploadStatus: RecoveryUploadStatus,
    failureReason?: string | null,
  ): Promise<void> {
    await withStore('readwrite', async (store) => {
      const record = (await idbRequest(store.get(id))) as StoredTemporaryRecording | undefined;
      if (!record) {
        throw ReliabilityError.failedRecovery('Temporary recording not found.');
      }

      record.uploadStatus = uploadStatus;
      record.failureReason = failureReason ?? null;
      await idbRequest(store.put(record));
    });
  }

  async deleteTemporaryRecording(id: string): Promise<void> {
    await withStore('readwrite', async (store) => {
      await idbRequest(store.delete(id));
    });
  }
}

export const recordingRecoveryService = new RecordingRecoveryService();

export type { StoredTemporaryRecording };
