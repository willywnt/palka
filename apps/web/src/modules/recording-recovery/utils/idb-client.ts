import { ReliabilityError } from '../errors/reliability-errors';

export function isIndexedDbSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  if (!isIndexedDbSupported()) {
    return Promise.reject(ReliabilityError.indexedDbUnavailable());
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onerror = () => {
      reject(ReliabilityError.indexedDbUnavailable());
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      upgrade(db);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function idbTransactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}
