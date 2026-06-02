'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

import {
  useCancelRecordingMutation,
  useMarkUploadingMutation,
  useSaveRecordingMetadataMutation,
} from '@/modules/recordings/hooks/use-recording-api';
import { useRecordingStore } from '@/modules/recordings/store/recording.store';
import {
  RECORDING_FAILURE_CODES,
  resolveFailureFromCode,
} from '@/modules/recordings/recovery/types/failure-codes';
import { RECORDING_TIMELINE_EVENT_TYPES } from '../types/recording-timeline';

import { retryTemporaryRecordingUpload } from '../services/upload-retry.service';
import { recordingRecoveryService } from '../services/recording-recovery.service';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';
import { recoverDefaultCameraPreview } from '../utils/camera-stream';

export function useUploadRetry() {
  const markUploadingMutation = useMarkUploadingMutation();
  const saveMetadataMutation = useSaveRecordingMetadataMutation();
  const cancelRecordingMutation = useCancelRecordingMutation();

  const setIsRetryingUpload = useRecordingReliabilityStore((state) => state.setIsRetryingUpload);
  const setRetryUploadProgress = useRecordingReliabilityStore(
    (state) => state.setRetryUploadProgress,
  );
  const setTemporaryRecordings = useRecordingReliabilityStore(
    (state) => state.setTemporaryRecordings,
  );
  const closeRecoveryModal = useRecordingReliabilityStore((state) => state.closeRecoveryModal);
  const resetReconnectPrompt = useRecordingReliabilityStore((state) => state.resetReconnectPrompt);

  const refreshTemporaryRecordings = useCallback(async () => {
    const recordings = await recordingRecoveryService.getTemporaryRecordings();
    setTemporaryRecordings(recordings);
    return recordings;
  }, [setTemporaryRecordings]);

  const retryUpload = useCallback(
    async (temporaryId: string) => {
      setIsRetryingUpload(true);
      setRetryUploadProgress(0);

      try {
        await retryTemporaryRecordingUpload(temporaryId, {
          markUploading: (recordingId) => markUploadingMutation.mutateAsync(recordingId),
          saveMetadata: (payload) => saveMetadataMutation.mutateAsync(payload),
          onProgress: (percent) => setRetryUploadProgress(percent),
        });

        const recordings = await refreshTemporaryRecordings();

        if (recordings.length === 0) {
          closeRecoveryModal();
        }

        await recordingRecoveryService.setRecoveryModalDismissed(true);
        resetReconnectPrompt();
        useRecordingStore.getState().reset();
        useRecordingReliabilityStore.getState().setWebcamDisconnected(false);
        await recoverDefaultCameraPreview();
        toast.success('Recording uploaded successfully');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        toast.error('Upload failed', { description: message });
        await refreshTemporaryRecordings();
        useRecordingReliabilityStore.getState().setWebcamDisconnected(false);
        await recoverDefaultCameraPreview();
        throw error;
      } finally {
        setIsRetryingUpload(false);
        setRetryUploadProgress(0);
      }
    },
    [
      closeRecoveryModal,
      markUploadingMutation,
      refreshTemporaryRecordings,
      resetReconnectPrompt,
      saveMetadataMutation,
      setIsRetryingUpload,
      setRetryUploadProgress,
    ],
  );

  const discardRecording = useCallback(
    async (temporaryId: string) => {
      const record = await recordingRecoveryService.getTemporaryRecordingWithBlob(temporaryId);

      await recordingRecoveryService.deleteTemporaryRecording(temporaryId);

      if (record?.recordingId) {
        const hadCameraDisconnect =
          record.failureCode === RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED ||
          record.timeline.some(
            (event) => event.type === RECORDING_TIMELINE_EVENT_TYPES.CAMERA_DISCONNECTED,
          );

        try {
          await cancelRecordingMutation.mutateAsync({
            recordingId: record.recordingId,
            failureCode: hadCameraDisconnect
              ? RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED
              : RECORDING_FAILURE_CODES.UPLOAD_CANCELLED,
            failureReason: hadCameraDisconnect
              ? resolveFailureFromCode(RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED)
              : 'Recording discarded by operator.',
          });
        } catch {
          // Server session may already be terminal.
        }
      }

      const recordings = await refreshTemporaryRecordings();

      if (recordings.length === 0) {
        closeRecoveryModal();
      }

      await recordingRecoveryService.setRecoveryModalDismissed(true);
      useRecordingStore.getState().reset();
      useRecordingReliabilityStore.getState().setWebcamDisconnected(false);
      await recoverDefaultCameraPreview();

      toast.success('Local recording discarded');
    },
    [cancelRecordingMutation, closeRecoveryModal, refreshTemporaryRecordings],
  );

  return { retryUpload, discardRecording, refreshTemporaryRecordings };
}
