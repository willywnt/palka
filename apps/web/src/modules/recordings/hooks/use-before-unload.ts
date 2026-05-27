'use client';

import { useEffect } from 'react';

import { releaseRecordingLock } from '../hooks/use-tab-lock';
import { selectShouldWarnBeforeUnload, useRecordingStore } from '../store/recording.store';

export function useBeforeUnloadProtection() {
  const shouldWarn = useRecordingStore(selectShouldWarnBeforeUnload);

  useEffect(() => {
    if (!shouldWarn) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      releaseRecordingLock();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [shouldWarn]);
}
