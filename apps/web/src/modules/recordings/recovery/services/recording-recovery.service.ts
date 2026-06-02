import {
  RECORDING_RECOVERY_CONFIG,
  RECOVERY_METADATA_KEYS,
  type RecoveryUploadStatus,
  type SaveTemporaryRecordingInput,
  type TemporaryRecording,
} from '../types';
import type { RecordingFailureCode } from '../types/failure-codes';
import {
  createTimelineEvent,
  RECORDING_TIMELINE_EVENT_TYPES,
  type RecordingTimelineEvent,
} from '../types/recording-timeline';
import { resolvePendingRecordingFailureMessage } from '../types/failure-codes';
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

function upgradeDatabase(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(RECORDING_RECOVERY_CONFIG.storeName)) {
    const store = db.createObjectStore(RECORDING_RECOVERY_CONFIG.storeName, { keyPath: 'id' });
    store.createIndex('uploadStatus', 'uploadStatus', { unique: false });
    store.createIndex('createdAt', 'createdAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(RECORDING_RECOVERY_CONFIG.metadataStoreName)) {
    db.createObjectStore(RECORDING_RECOVERY_CONFIG.metadataStoreName, { keyPath: 'key' });
  }
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase(
    RECORDING_RECOVERY_CONFIG.dbName,
    RECORDING_RECOVERY_CONFIG.dbVersion,
    upgradeDatabase,
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

async function withMetadataStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase(
    RECORDING_RECOVERY_CONFIG.dbName,
    RECORDING_RECOVERY_CONFIG.dbVersion,
    upgradeDatabase,
  );

  try {
    const transaction = db.transaction(RECORDING_RECOVERY_CONFIG.metadataStoreName, mode);
    const store = transaction.objectStore(RECORDING_RECOVERY_CONFIG.metadataStoreName);
    const result = await handler(store);
    await idbTransactionComplete(transaction);
    return result;
  } finally {
    db.close();
  }
}

function normalizeRecord(record: StoredTemporaryRecording): StoredTemporaryRecording {
  return {
    ...record,
    failureCode: record.failureCode ?? null,
    failureMessage: resolvePendingRecordingFailureMessage(record),
    failureReason: record.failureReason ?? null,
    retryCount: record.retryCount ?? 0,
    timeline: record.timeline ?? [],
  };
}

function toTemporaryRecording(record: StoredTemporaryRecording): TemporaryRecording {
  const normalized = normalizeRecord(record);
  return {
    id: normalized.id,
    recordingId: normalized.recordingId,
    noResi: normalized.noResi,
    mimeType: normalized.mimeType,
    durationSeconds: normalized.durationSeconds,
    estimatedSizeBytes: normalized.estimatedSizeBytes,
    createdAt: normalized.createdAt,
    uploadStatus: normalized.uploadStatus,
    failureCode: normalized.failureCode,
    failureMessage: normalized.failureMessage,
    failureReason: normalized.failureReason,
    retryCount: normalized.retryCount,
    timeline: normalized.timeline,
  };
}

export class RecordingRecoveryService {
  isAvailable(): boolean {
    return isIndexedDbSupported();
  }

  async getMetadataValue<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;

    const entry = await withMetadataStore('readonly', async (store) => {
      return idbRequest(store.get(key)) as Promise<{ key: string; value: T } | undefined>;
    });

    return entry?.value ?? null;
  }

  async setMetadataValue<T>(key: string, value: T): Promise<void> {
    await withMetadataStore('readwrite', async (store) => {
      await idbRequest(store.put({ key, value }));
    });
  }

  async isRecoveryModalDismissed(): Promise<boolean> {
    const value = await this.getMetadataValue<boolean>(
      RECOVERY_METADATA_KEYS.recoveryModalDismissed,
    );
    return value === true;
  }

  async setRecoveryModalDismissed(dismissed: boolean): Promise<void> {
    await this.setMetadataValue(RECOVERY_METADATA_KEYS.recoveryModalDismissed, dismissed);
  }

  async saveTemporaryRecording(input: SaveTemporaryRecordingInput): Promise<TemporaryRecording> {
    const timeline: RecordingTimelineEvent[] = input.timeline ?? [
      createTimelineEvent(
        RECORDING_TIMELINE_EVENT_TYPES.RECORDING_PRESERVED,
        'Recording saved on this device for upload recovery.',
      ),
    ];

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
      failureCode: input.failureCode ?? null,
      failureMessage: input.failureMessage ?? null,
      failureReason: input.failureReason ?? null,
      retryCount: 0,
      timeline,
    };

    await withStore('readwrite', async (store) => {
      await idbRequest(store.put(record));
    });

    await this.setRecoveryModalDismissed(false);

    return toTemporaryRecording(record);
  }

  async getTemporaryRecordings(): Promise<TemporaryRecording[]> {
    if (!this.isAvailable()) return [];

    const records = await withStore('readonly', async (store) => {
      return idbRequest(store.getAll()) as Promise<StoredTemporaryRecording[]>;
    });

    return records
      .filter((record) => record.uploadStatus !== 'COMPLETED')
      .map((record) => toTemporaryRecording(normalizeRecord(record)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getTotalPendingBytes(): Promise<number> {
    const recordings = await this.getTemporaryRecordings();
    return recordings.reduce((sum, recording) => sum + recording.estimatedSizeBytes, 0);
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

    return record ? normalizeRecord(record) : null;
  }

  async appendTimelineEvent(id: string, event: RecordingTimelineEvent): Promise<void> {
    await withStore('readwrite', async (store) => {
      const record = (await idbRequest(store.get(id))) as StoredTemporaryRecording | undefined;
      if (!record) return;

      const normalized = normalizeRecord(record);
      normalized.timeline = [...normalized.timeline, event];
      await idbRequest(store.put(normalized));
    });
  }

  async updateUploadStatus(
    id: string,
    uploadStatus: RecoveryUploadStatus,
    options?: {
      failureCode?: RecordingFailureCode | null;
      failureMessage?: string | null;
      failureReason?: string | null;
      timelineEvent?: RecordingTimelineEvent;
      incrementRetryCount?: boolean;
    },
  ): Promise<void> {
    await withStore('readwrite', async (store) => {
      const record = (await idbRequest(store.get(id))) as StoredTemporaryRecording | undefined;
      if (!record) {
        throw ReliabilityError.failedRecovery('Temporary recording not found.');
      }

      const normalized = normalizeRecord(record);
      normalized.uploadStatus = uploadStatus;
      normalized.failureCode = options?.failureCode ?? null;
      normalized.failureMessage = options?.failureMessage ?? null;
      normalized.failureReason = options?.failureReason ?? null;

      if (options?.incrementRetryCount) {
        normalized.retryCount += 1;
      }

      if (options?.timelineEvent) {
        normalized.timeline = [...normalized.timeline, options.timelineEvent];
      }

      await idbRequest(store.put(normalized));
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
