'use client';

import { useEffect } from 'react';

import { useRecordingReliabilityStore } from '../store/recording-reliability.store';
import { isBrowserOnline } from '../utils/network';

export function useOfflineDetection() {
  const setOnline = useRecordingReliabilityStore((state) => state.setOnline);

  useEffect(() => {
    setOnline(isBrowserOnline());

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);
}
