'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { uploadFile } from '@/modules/storage/utils/upload-file';
import { apiFetch } from '@/lib/api/fetch-client';
import { apiRoutes } from '@/lib/api/routes';
import { recordingRecoveryService } from '@/modules/recording-recovery/services/recording-recovery.service';
import {
  recoverDefaultCameraPreview,
  resolveRecordingStream,
} from '@/modules/recording-recovery/utils/camera-stream';
import { useRecordingReliabilityStore } from '@/modules/recording-recovery/store/recording-reliability.store';
import { isRecoverableUploadError } from '@/modules/recording-recovery/utils/network';
import type { SaveTemporaryRecordingInput } from '@/modules/recording-recovery/types';

import { RecordingError } from '../errors/recording-errors';
import type { ActiveRecordingSession } from '../types';
import {
  useCancelRecordingMutation,
  useMarkUploadingMutation,
  useSaveRecordingMetadataMutation,
  useStartRecordingMutation,
} from './use-recording-api';
import { useBeforeUnloadProtection } from './use-before-unload';
import {
  releaseRecordingLock,
  tryAcquireRecordingLock,
  useTabLockProtection,
} from './use-tab-lock';
import { recordingService } from '../services/recording.service';
import { useRecordingStore } from '../store/recording.store';
import { estimateRecordingFileSizeBytes } from '../utils/media-recorder';
import { setRecordingSession } from '../utils/recording-session';
import { isAnotherTabRecording } from '../utils/tab-lock';
import { noResiSchema } from '../validators/no-resi';

async function persistRecoverableRecording(input: SaveTemporaryRecordingInput): Promise<boolean> {
  if (!recordingRecoveryService.isAvailable()) {
    return false;
  }

  try {
    const saved = await recordingRecoveryService.saveTemporaryRecording({
      ...input,
      uploadStatus: input.uploadStatus ?? 'PENDING',
    });

    const store = useRecordingReliabilityStore.getState();
    const recordings = await recordingRecoveryService.getTemporaryRecordings();
    store.setTemporaryRecordings(recordings);
    store.openRecoveryModal(saved.id);
    return true;
  } catch {
    return false;
  }
}

export function useRecording() {
  const timerRef = useRef<number | null>(null);
  const abortUploadRef = useRef<AbortController | null>(null);
  const handleWebcamDisconnectRef = useRef<() => Promise<void>>(async () => {});

  const status = useRecordingStore((state) => state.status);
  const noResi = useRecordingStore((state) => state.noResi);
  const activeRecording = useRecordingStore((state) => state.activeRecording);
  const durationSeconds = useRecordingStore((state) => state.durationSeconds);
  const uploadProgress = useRecordingStore((state) => state.uploadProgress);
  const estimatedFileSizeBytes = useRecordingStore((state) => state.estimatedFileSizeBytes);
  const mediaStream = useRecordingStore((state) => state.mediaStream);
  const error = useRecordingStore((state) => state.error);
  const completedRecording = useRecordingStore((state) => state.completedRecording);

  const setStatus = useRecordingStore((state) => state.setStatus);
  const setNoResi = useRecordingStore((state) => state.setNoResi);
  const setActiveRecording = useRecordingStore((state) => state.setActiveRecording);
  const setDurationSeconds = useRecordingStore((state) => state.setDurationSeconds);
  const setUploadProgress = useRecordingStore((state) => state.setUploadProgress);
  const setEstimatedFileSizeBytes = useRecordingStore((state) => state.setEstimatedFileSizeBytes);
  const setMediaStream = useRecordingStore((state) => state.setMediaStream);
  const setError = useRecordingStore((state) => state.setError);
  const setCompletedRecording = useRecordingStore((state) => state.setCompletedRecording);
  const resetStore = useRecordingStore((state) => state.reset);

  const setWebcamDisconnected = useRecordingReliabilityStore(
    (state) => state.setWebcamDisconnected,
  );

  const startRecordingMutation = useStartRecordingMutation();
  const markUploadingMutation = useMarkUploadingMutation();
  const saveMetadataMutation = useSaveRecordingMetadataMutation();
  const cancelRecordingMutation = useCancelRecordingMutation();

  useBeforeUnloadProtection();
  useTabLockProtection();

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleFailure = useCallback(
    async (recordingError: RecordingError, recordingId?: string) => {
      setStatus('FAILED');
      setError(recordingError.message, recordingError.code);
      clearTimer();
      recordingService.cleanup();
      setMediaStream(null);
      releaseRecordingLock();

      if (recordingId) {
        try {
          await cancelRecordingMutation.mutateAsync(recordingId);
        } catch {
          // Ignore cleanup failures.
        }
      }

      toast.error('Recording failed', { description: recordingError.message });
    },
    [cancelRecordingMutation, clearTimer, setError, setMediaStream, setStatus],
  );

  const handleRecoverableFailure = useCallback(
    async (params: {
      blob: Blob;
      mimeType: string;
      recordingId: string;
      noResi: string;
      durationSeconds: number;
      message: string;
      errorCode: string;
      failureReason: string;
      notifyWebcamDisconnect?: boolean;
    }) => {
      clearTimer();
      recordingService.cleanup();
      setMediaStream(null);
      releaseRecordingLock();

      const persisted = await persistRecoverableRecording({
        blob: params.blob,
        mimeType: params.mimeType,
        recordingId: params.recordingId,
        noResi: params.noResi,
        durationSeconds: params.durationSeconds,
        uploadStatus: 'PENDING',
        failureReason: params.failureReason,
      });

      if (params.notifyWebcamDisconnect) {
        setWebcamDisconnected(true);
      }

      setStatus('FAILED');
      setError(params.message, params.errorCode);

      if (persisted) {
        toast.warning('Recording preserved locally', { description: params.message });
      } else {
        toast.error('Recording failed', {
          description: `${params.message} Local storage is unavailable — the recording could not be saved.`,
        });
      }
    },
    [clearTimer, setError, setMediaStream, setStatus, setWebcamDisconnected],
  );

  const handleWebcamDisconnect = useCallback(async () => {
    const { status: currentStatus, activeRecording: currentActive } = useRecordingStore.getState();
    if (currentStatus !== 'RECORDING' || !currentActive) return;

    setStatus('STOPPING');
    clearTimer();

    try {
      const { blob, mimeType } = await recordingService.stopRecording();

      if (blob.size === 0) {
        await handleFailure(RecordingError.recordingInterrupted(), currentActive.id);
        return;
      }

      await handleRecoverableFailure({
        blob,
        mimeType,
        recordingId: currentActive.id,
        noResi: currentActive.noResi,
        durationSeconds: useRecordingStore.getState().durationSeconds,
        message: 'Camera disconnected. Your recording was safely preserved locally.',
        errorCode: 'CAMERA_DISCONNECTED',
        failureReason: 'Camera disconnected during recording',
        notifyWebcamDisconnect: true,
      });
    } catch {
      await handleFailure(RecordingError.recordingInterrupted(), currentActive.id);
    }
  }, [clearTimer, handleFailure, handleRecoverableFailure, setStatus]);

  handleWebcamDisconnectRef.current = handleWebcamDisconnect;

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      const nextDuration = useRecordingStore.getState().durationSeconds + 1;
      setDurationSeconds(nextDuration);
      setEstimatedFileSizeBytes(estimateRecordingFileSizeBytes(nextDuration));
    }, 1000);
  }, [clearTimer, setDurationSeconds, setEstimatedFileSizeBytes]);

  const beginRecordingSession = useCallback(
    async (parsedNoResi: string) => {
      const started = await startRecordingMutation.mutateAsync(parsedNoResi);
      setActiveRecording({
        id: started.recordingId,
        noResi: started.noResi,
        startedAt: started.startedAt,
      });
      setRecordingSession(started.recordingId);

      const preferredDeviceId = useRecordingReliabilityStore.getState().preferredCameraDeviceId;
      const stream = await resolveRecordingStream(preferredDeviceId);
      setMediaStream(stream);

      recordingService.startRecording(stream, () => {
        void handleWebcamDisconnectRef.current();
      });

      setStatus('RECORDING');
      startTimer();
      toast.success('Recording started');
    },
    [setActiveRecording, setMediaStream, setStatus, startRecordingMutation, startTimer],
  );

  const startRecording = useCallback(async () => {
    const parsedNoResi = noResiSchema.safeParse(noResi);

    if (!parsedNoResi.success) {
      setError(parsedNoResi.error.errors[0]?.message ?? 'Invalid resi number', 'VALIDATION_ERROR');
      return;
    }

    if (!tryAcquireRecordingLock()) {
      await handleFailure(RecordingError.tabLockConflict());
      return;
    }

    setError(null);
    setCompletedRecording(null);
    setUploadProgress(0);
    setDurationSeconds(0);
    setEstimatedFileSizeBytes(0);
    setWebcamDisconnected(false);
    setStatus('REQUESTING_PERMISSION');

    try {
      await beginRecordingSession(parsedNoResi.data);
    } catch (unknownError) {
      const recordingError = RecordingError.fromUnknown(unknownError);

      if (recordingError.code === 'ACTIVE_RECORDING_EXISTS' && !isAnotherTabRecording()) {
        try {
          const activeResult = await apiFetch<ActiveRecordingSession | null>(
            `${apiRoutes.recordings}/active`,
          );

          if (activeResult.success && activeResult.data?.id) {
            await cancelRecordingMutation.mutateAsync(activeResult.data.id);
          }

          await beginRecordingSession(parsedNoResi.data);
          return;
        } catch {
          // Fall through to failure handling below.
        }
      }

      releaseRecordingLock();
      recordingService.cleanup();
      setMediaStream(null);

      await handleFailure(recordingError, useRecordingStore.getState().activeRecording?.id);
    }
  }, [
    beginRecordingSession,
    cancelRecordingMutation,
    handleFailure,
    noResi,
    setCompletedRecording,
    setDurationSeconds,
    setError,
    setEstimatedFileSizeBytes,
    setMediaStream,
    setStatus,
    setUploadProgress,
    setWebcamDisconnected,
  ]);

  const stopRecording = useCallback(async () => {
    if (status !== 'RECORDING' || !activeRecording) return;

    setStatus('STOPPING');
    clearTimer();

    const recordingId = activeRecording.id;
    let capturedBlob: Blob | null = null;
    let capturedMimeType = 'video/webm';

    try {
      const { blob, mimeType } = await recordingService.stopRecording();
      capturedBlob = blob;
      capturedMimeType = mimeType;

      if (blob.size === 0) {
        throw RecordingError.recordingInterrupted();
      }

      recordingService.cleanup();
      setMediaStream(null);

      const file = recordingService.createUploadFile(blob, `recording-${Date.now()}.webm`);

      setStatus('UPLOADING');
      setUploadProgress(0);

      await markUploadingMutation.mutateAsync(recordingId);

      abortUploadRef.current = new AbortController();

      const uploadResult = await uploadFile({
        file,
        signal: abortUploadRef.current.signal,
        onProgress: ({ percent }) => setUploadProgress(percent),
      });

      const saved = await saveMetadataMutation.mutateAsync({
        recordingId,
        noResi: activeRecording.noResi,
        storageKey: uploadResult.storageKey,
        publicUrl: uploadResult.publicUrl,
        fileSizeBytes: file.size,
        durationSeconds: useRecordingStore.getState().durationSeconds,
        mimeType,
      });

      setCompletedRecording({
        id: saved.id,
        noResi: saved.noResi,
        publicUrl: saved.publicUrl,
        storageKey: saved.storageKey,
        fileSizeBytes: saved.fileSizeBytes,
        durationSeconds: saved.durationSeconds,
      });
      setStatus('COMPLETED');
      releaseRecordingLock();
      toast.success('Recording uploaded successfully');
    } catch (unknownError) {
      if (unknownError instanceof DOMException && unknownError.name === 'AbortError') {
        await handleFailure(RecordingError.uploadFailed('Upload cancelled.'), recordingId);
        return;
      }

      const message = unknownError instanceof Error ? unknownError.message : 'Upload failed';

      if (message.toLowerCase().includes('quota')) {
        await handleFailure(RecordingError.quotaExceeded(), recordingId);
        return;
      }

      if (capturedBlob && capturedBlob.size > 0 && isRecoverableUploadError(unknownError)) {
        await handleRecoverableFailure({
          blob: capturedBlob,
          mimeType: capturedMimeType,
          recordingId,
          noResi: activeRecording.noResi,
          durationSeconds: useRecordingStore.getState().durationSeconds,
          message:
            'Upload failed. Your recording is safely stored locally. Retry when you are back online.',
          errorCode: 'UPLOAD_RECOVERABLE',
          failureReason: message,
        });
        return;
      }

      await handleFailure(RecordingError.uploadFailed(message), recordingId);
    } finally {
      abortUploadRef.current = null;
    }
  }, [
    activeRecording,
    clearTimer,
    handleFailure,
    handleRecoverableFailure,
    markUploadingMutation,
    saveMetadataMutation,
    setCompletedRecording,
    setMediaStream,
    setStatus,
    setUploadProgress,
    status,
  ]);

  const cancelUpload = useCallback(() => {
    abortUploadRef.current?.abort();
  }, []);

  const reset = useCallback(async () => {
    clearTimer();
    cancelUpload();
    recordingService.cleanup();
    releaseRecordingLock();
    setMediaStream(null);
    setWebcamDisconnected(false);

    const recordingId = useRecordingStore.getState().activeRecording?.id;
    if (recordingId) {
      try {
        await cancelRecordingMutation.mutateAsync(recordingId);
      } catch {
        // Ignore cleanup failures.
      }
    }

    resetStore();
    useRecordingReliabilityStore.getState().setWebcamDisconnected(false);
    await recoverDefaultCameraPreview();
  }, [
    cancelRecordingMutation,
    cancelUpload,
    clearTimer,
    resetStore,
    setMediaStream,
    setWebcamDisconnected,
  ]);

  const retryPermission = useCallback(async () => {
    await reset();
    await startRecording();
  }, [reset, startRecording]);

  useEffect(() => {
    const handlePageHide = () => {
      releaseRecordingLock();
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      clearTimer();
      recordingService.cleanup();
      releaseRecordingLock();
    };
  }, [clearTimer]);

  return {
    status,
    noResi,
    setNoResi,
    activeRecording,
    durationSeconds,
    uploadProgress,
    estimatedFileSizeBytes,
    mediaStream,
    error,
    completedRecording,
    isBusy:
      status === 'REQUESTING_PERMISSION' ||
      status === 'RECORDING' ||
      status === 'STOPPING' ||
      status === 'UPLOADING',
    canStart: status === 'IDLE' || status === 'FAILED' || status === 'COMPLETED',
    canStop: status === 'RECORDING',
    startRecording,
    stopRecording,
    cancelUpload,
    reset,
    retryPermission,
  };
}
