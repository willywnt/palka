'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api/fetch-client';
import { apiRoutes } from '@/lib/api/routes';
import { useCancelRecordingMutation } from '@/modules/recordings/hooks/use-recording-api';
import type { ActiveRecordingSession } from '@/modules/recordings/types';
import { useRecordingStore } from '@/modules/recordings/store/recording.store';
import { cleanupStaleLock, isAnotherTabRecording } from '@/modules/recordings/utils/tab-lock';
import { clearRecordingSession } from '@/modules/recordings/utils/recording-session';

import { recordingRecoveryService } from '../services/recording-recovery.service';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';
import { isIndexedDbSupported } from '../utils/idb-client';
import { RECORDING_FAILURE_CODES } from '@/modules/recordings/recovery/types/failure-codes';

import { ReliabilityError } from '../errors/reliability-errors';

const ACTIVE_LOCAL_STATUSES = new Set([
  'REQUESTING_PERMISSION',
  'RECORDING',
  'STOPPING',
  'UPLOADING',
]);

function shouldCancelOrphanedServerSession(): boolean {
  const localStatus = useRecordingStore.getState().status;
  if (ACTIVE_LOCAL_STATUSES.has(localStatus)) {
    return false;
  }

  if (isAnotherTabRecording()) {
    return false;
  }

  cleanupStaleLock();
  return true;
}

async function reconcileOrphanedServerSession(
  cancelRecording: (recordingId: string) => Promise<unknown>,
): Promise<boolean> {
  if (!shouldCancelOrphanedServerSession()) {
    return false;
  }

  const activeResult = await apiFetch<ActiveRecordingSession | null>(
    `${apiRoutes.recordings}/active`,
  );

  if (!activeResult.success || !activeResult.data?.id) {
    return false;
  }

  const recordingId = activeResult.data.id;

  if (recordingRecoveryService.isAvailable()) {
    const tempRecordings = await recordingRecoveryService.getTemporaryRecordings();
    const hasLocalRecovery = tempRecordings.some(
      (recording) => recording.recordingId === recordingId,
    );

    if (hasLocalRecovery) {
      return false;
    }
  }

  try {
    await cancelRecording(recordingId);
    clearRecordingSession();
    return true;
  } catch {
    return false;
  }
}

export function useRecoveryBootstrap() {
  const bootstrappedRef = useRef(false);

  const setIndexedDbAvailable = useRecordingReliabilityStore(
    (state) => state.setIndexedDbAvailable,
  );
  const setTemporaryRecordings = useRecordingReliabilityStore(
    (state) => state.setTemporaryRecordings,
  );
  const openRecoveryModal = useRecordingReliabilityStore((state) => state.openRecoveryModal);
  const setStaleLockCleared = useRecordingReliabilityStore((state) => state.setStaleLockCleared);

  const cancelRecordingMutation = useCancelRecordingMutation();

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    async function bootstrap() {
      const staleLockCleared = cleanupStaleLock();
      setStaleLockCleared(staleLockCleared);

      if (staleLockCleared) {
        toast.info('Stale recording lock cleared', {
          description: ReliabilityError.staleSession().message,
        });
      }

      const clearedOrphan = await reconcileOrphanedServerSession((recordingId) =>
        cancelRecordingMutation.mutateAsync({
          recordingId,
          failureCode: RECORDING_FAILURE_CODES.UNKNOWN_ERROR,
          failureReason: 'Recording session was interrupted before upload completed.',
        }),
      );

      if (clearedOrphan) {
        toast.info('Interrupted recording cleared', {
          description: 'A previous session was closed. You can start a new recording.',
        });
      }

      const idbAvailable = isIndexedDbSupported();
      setIndexedDbAvailable(idbAvailable);

      if (!idbAvailable) return;

      try {
        const recordings = await recordingRecoveryService.getTemporaryRecordings();
        setTemporaryRecordings(recordings);

        if (recordings.length > 0) {
          const dismissed = await recordingRecoveryService.isRecoveryModalDismissed();
          if (!dismissed) {
            openRecoveryModal(recordings[0]?.id ?? null);
          } else {
            toast.info('Pending uploads found', {
              description: 'Open the pending upload center to retry or discard local recordings.',
            });
          }
        }
      } catch {
        setIndexedDbAvailable(false);
      }
    }

    void bootstrap();
  }, [
    cancelRecordingMutation,
    openRecoveryModal,
    setIndexedDbAvailable,
    setStaleLockCleared,
    setTemporaryRecordings,
  ]);
}
