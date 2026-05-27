'use client';

import { useEffect } from 'react';

import {
  acquireTabLock,
  cleanupStaleLock,
  createTabLockChannel,
  getTabLockHeartbeatMs,
  isAnotherTabRecording,
  refreshTabLock,
  releaseTabLock,
} from '../utils/tab-lock';
import { useRecordingStore } from '../store/recording.store';

export function useTabLockProtection() {
  const status = useRecordingStore((state) => state.status);
  const setError = useRecordingStore((state) => state.setError);
  const setStatus = useRecordingStore((state) => state.setStatus);

  useEffect(() => {
    cleanupStaleLock();
  }, []);

  useEffect(() => {
    const channel = createTabLockChannel();

    channel?.addEventListener('message', () => {
      if (isAnotherTabRecording()) {
        setError('Recording is already active in another tab.', 'TAB_LOCK_CONFLICT');
        setStatus('FAILED');
      }
    });

    return () => {
      channel?.close();
    };
  }, [setError, setStatus]);

  useEffect(() => {
    if (status !== 'RECORDING' && status !== 'UPLOADING') return;

    const interval = window.setInterval(() => {
      refreshTabLock();
      channelNotify();
    }, getTabLockHeartbeatMs());

    const channel = createTabLockChannel();
    function channelNotify() {
      channel?.postMessage({ type: 'heartbeat' });
    }

    return () => {
      window.clearInterval(interval);
      channel?.close();
    };
  }, [status]);
}

export function tryAcquireRecordingLock(): boolean {
  return acquireTabLock();
}

export function releaseRecordingLock(): void {
  releaseTabLock();
}
