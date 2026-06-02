'use client';

import { useOfflineDetection } from '../hooks/use-offline-detection';
import { usePendingRecordingsSync } from '../hooks/use-pending-recordings-sync';
import { useRecoveryBootstrap } from '../hooks/use-recovery-bootstrap';
import { RecoveryModal } from './recovery-modal';

type GlobalRecordingReliabilityProps = {
  children: React.ReactNode;
};

/** Dashboard-wide recovery bootstrap, offline detection, and one-time recovery modal. */
export function GlobalRecordingReliability({ children }: GlobalRecordingReliabilityProps) {
  useOfflineDetection();
  usePendingRecordingsSync();
  useRecoveryBootstrap();

  return (
    <>
      {children}
      <RecoveryModal />
    </>
  );
}
