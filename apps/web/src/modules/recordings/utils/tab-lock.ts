import { RECORDING_MODULE_CONFIG } from '../types';
import { RECORDING_RECOVERY_CONFIG } from '@/modules/recording-recovery/types';
import { clearRecordingSession, refreshRecordingSession } from './recording-session';

type TabLockPayload = {
  tabId: string;
  updatedAt: number;
  /** @deprecated Legacy field — migrated to updatedAt on read */
  acquiredAt?: number;
};

let staleLockClearedOnInit = false;

function getTabId(): string {
  if (typeof window === 'undefined') return 'server';

  const key = 'olshop-recording-tab-id';
  const existing = sessionStorage.getItem(key);

  if (existing) return existing;

  const tabId = crypto.randomUUID();
  sessionStorage.setItem(key, tabId);
  return tabId;
}

function readLock(): TabLockPayload | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(RECORDING_MODULE_CONFIG.tabLockKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as TabLockPayload;
    return {
      tabId: parsed.tabId,
      updatedAt: parsed.updatedAt ?? parsed.acquiredAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

function writeLock(payload: TabLockPayload): void {
  localStorage.setItem(
    RECORDING_MODULE_CONFIG.tabLockKey,
    JSON.stringify({ tabId: payload.tabId, updatedAt: payload.updatedAt }),
  );
}

function clearLock(tabId: string): void {
  const current = readLock();
  if (current?.tabId === tabId) {
    localStorage.removeItem(RECORDING_MODULE_CONFIG.tabLockKey);
  }
}

function getLockTimestamp(lock: TabLockPayload): number {
  return lock.updatedAt ?? lock.acquiredAt ?? 0;
}

function isLockStale(lock: TabLockPayload): boolean {
  return Date.now() - getLockTimestamp(lock) > RECORDING_RECOVERY_CONFIG.sessionLockStaleMs;
}

export function cleanupStaleLock(): boolean {
  const current = readLock();
  if (!current || !isLockStale(current)) return false;

  localStorage.removeItem(RECORDING_MODULE_CONFIG.tabLockKey);
  staleLockClearedOnInit = true;
  return true;
}

export function wasStaleLockClearedOnInit(): boolean {
  return staleLockClearedOnInit;
}

export function acquireTabLock(): boolean {
  cleanupStaleLock();

  const tabId = getTabId();
  const current = readLock();

  if (current && !isLockStale(current) && current.tabId !== tabId) {
    return false;
  }

  writeLock({ tabId, updatedAt: Date.now() });
  return readLock()?.tabId === tabId;
}

export function releaseTabLock(): void {
  clearLock(getTabId());
  clearRecordingSession();
}

export function refreshTabLock(): void {
  const tabId = getTabId();
  const current = readLock();

  if (current?.tabId === tabId) {
    writeLock({ tabId, updatedAt: Date.now() });
    refreshRecordingSession();
  }
}

export function hasFreshLockForCurrentTab(): boolean {
  cleanupStaleLock();
  const current = readLock();
  if (!current || isLockStale(current)) return false;
  return current.tabId === getTabId();
}

export function createTabLockChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(RECORDING_MODULE_CONFIG.tabLockChannel);
}

export function isAnotherTabRecording(): boolean {
  cleanupStaleLock();
  const current = readLock();
  if (!current || isLockStale(current)) return false;
  return current.tabId !== getTabId();
}

export function getTabLockHeartbeatMs(): number {
  return RECORDING_RECOVERY_CONFIG.sessionLockHeartbeatMs;
}
