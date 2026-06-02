'use client';

import { useCallback, useEffect } from 'react';

import { recordingRecoveryService } from '../services/recording-recovery.service';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';

export function usePendingRecordingsSync(enabled = true) {
  const setTemporaryRecordings = useRecordingReliabilityStore(
    (state) => state.setTemporaryRecordings,
  );
  const setIndexedDbAvailable = useRecordingReliabilityStore(
    (state) => state.setIndexedDbAvailable,
  );

  const refresh = useCallback(async () => {
    const available = recordingRecoveryService.isAvailable();
    setIndexedDbAvailable(available);

    if (!available) {
      setTemporaryRecordings([]);
      return [];
    }

    try {
      const recordings = await recordingRecoveryService.getTemporaryRecordings();
      setTemporaryRecordings(recordings);
      return recordings;
    } catch {
      setIndexedDbAvailable(false);
      setTemporaryRecordings([]);
      return [];
    }
  }, [setIndexedDbAvailable, setTemporaryRecordings]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [enabled, refresh]);

  return { refresh };
}
