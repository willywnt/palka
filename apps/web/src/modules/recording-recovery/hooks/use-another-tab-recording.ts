'use client';

import { useEffect, useState } from 'react';

import {
  cleanupStaleLock,
  createTabLockChannel,
  isAnotherTabRecording,
} from '@/modules/recordings/utils/tab-lock';

export function useAnotherTabRecording(): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const sync = () => {
      cleanupStaleLock();
      setBlocked(isAnotherTabRecording());
    };

    sync();

    const channel = createTabLockChannel();
    channel?.addEventListener('message', sync);
    window.addEventListener('storage', sync);

    const interval = window.setInterval(sync, 5_000);

    return () => {
      channel?.close();
      window.removeEventListener('storage', sync);
      window.clearInterval(interval);
    };
  }, []);

  return blocked;
}
