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
import {
  createTimelineEvent,
  RECORDING_TIMELINE_EVENT_TYPES,
} from '@/modules/recording-recovery/types/recording-timeline';
import {
  RECORDING_FAILURE_CODES,
  resolveFailureFromCode,
  resolveFailureFromError,
} from '@/modules/recording-recovery/types/failure-codes';

import { RecordingError } from '../errors/recording-errors';
import type { ActiveRecordingSession } from '../types';
import { useUploadProgressMetrics } from './use-upload-progress-metrics';
import { useStorageQuotaQuery } from '@/modules/storage/hooks/use-storage-quota';
import { isStorageQuotaExceeded } from '@/modules/storage/utils/quota-status';
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
import { clearRecordingSession, setRecordingSession } from '../utils/recording-session';
import { isAnotherTabRecording } from '../utils/tab-lock';
import { noResiSchema } from '../validators/no-resi';
import { mapRecordingErrorToFailureMetadata } from '../utils/recording-failure';

async function persistRecoverableRecording(input: SaveTemporaryRecordingInput): Promise<boolean> {
  if (!recordingRecoveryService.isAvailable()) {
    return false;
  }

  try {
    await recordingRecoveryService.saveTemporaryRecording({
      ...input,
      uploadStatus: input.uploadStatus ?? 'PENDING',
    });

    const store = useRecordingReliabilityStore.getState();
    const recordings = await recordingRecoveryService.getTemporaryRecordings();
    store.setTemporaryRecordings(recordings);
    store.setUploadCenterOpen(true);
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

  const { metrics: uploadMetrics, handleProgress, resetMetrics } = useUploadProgressMetrics();
  const { data: storageQuota } = useStorageQuotaQuery();
  const isQuotaExceeded = storageQuota ? isStorageQuotaExceeded(storageQuota) : false;

  useBeforeUnloadProtection();
  useTabLockProtection();

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Clears the form for the next recording while keeping optional success/error summary visible. */
  const resetSessionForNextRecording = useCallback(
    async (options?: { preserveError?: { message: string; code: string } }) => {
      setNoResi('');
      setActiveRecording(null);
      setDurationSeconds(0);
      setUploadProgress(0);
      setEstimatedFileSizeBytes(0);
      setStatus('IDLE');
      if (options?.preserveError) {
        setError(options.preserveError.message, options.preserveError.code);
      } else {
        setError(null);
      }
      resetMetrics();
      clearRecordingSession();
      await recoverDefaultCameraPreview();
    },
    [
      resetMetrics,
      setActiveRecording,
      setDurationSeconds,
      setError,
      setEstimatedFileSizeBytes,
      setNoResi,
      setStatus,
      setUploadProgress,
    ],
  );

  const handleFailure = useCallback(
    async (recordingError: RecordingError, recordingId?: string) => {
      setStatus('FAILED');
      setError(recordingError.message, recordingError.code);
      clearTimer();
      recordingService.cleanup();
      setMediaStream(null);
      releaseRecordingLock();

      if (recordingId) {
        const failureMetadata = mapRecordingErrorToFailureMetadata(recordingError);

        try {
          await cancelRecordingMutation.mutateAsync({
            recordingId,
            failureCode: failureMetadata.failureCode,
            failureReason: failureMetadata.failureReason,
          });
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
      failureCode?: string;
      failureReason: string;
      notifyWebcamDisconnect?: boolean;
      resetSession?: boolean;
    }) => {
      clearTimer();
      recordingService.cleanup();
      setMediaStream(null);
      releaseRecordingLock();

      const failure = params.failureCode
        ? {
            failureCode:
              params.failureCode as (typeof RECORDING_FAILURE_CODES)[keyof typeof RECORDING_FAILURE_CODES],
            failureMessage: params.message,
            debugMessage: params.failureReason,
          }
        : resolveFailureFromError(new Error(params.failureReason));

      const persisted = await persistRecoverableRecording({
        blob: params.blob,
        mimeType: params.mimeType,
        recordingId: params.recordingId,
        noResi: params.noResi,
        durationSeconds: params.durationSeconds,
        uploadStatus: 'PENDING',
        failureCode: failure.failureCode,
        failureMessage: failure.failureMessage,
        failureReason: failure.debugMessage,
        timeline: [
          createTimelineEvent(
            RECORDING_TIMELINE_EVENT_TYPES.RECORDING_PRESERVED,
            'Recording saved on this device for upload recovery.',
          ),
          ...(failure.failureCode === RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED
            ? [
                createTimelineEvent(
                  RECORDING_TIMELINE_EVENT_TYPES.CAMERA_DISCONNECTED,
                  failure.failureMessage,
                ),
              ]
            : [
                createTimelineEvent(
                  RECORDING_TIMELINE_EVENT_TYPES.UPLOAD_INTERRUPTED,
                  failure.failureMessage,
                ),
              ]),
        ],
      });

      if (params.resetSession || params.notifyWebcamDisconnect) {
        if (params.notifyWebcamDisconnect) {
          setWebcamDisconnected(true);
        }
        await resetSessionForNextRecording({
          preserveError: { message: params.message, code: params.errorCode },
        });
      } else {
        setStatus('FAILED');
        setError(params.message, params.errorCode);
      }

      if (persisted) {
        toast.warning('Recording preserved locally', { description: params.message });
      } else {
        toast.error('Recording failed', {
          description: `${params.message} Local storage is unavailable — the recording could not be saved.`,
        });
      }

      try {
        await cancelRecordingMutation.mutateAsync({
          recordingId: params.recordingId,
          failureCode: failure.failureCode,
          failureReason: failure.failureMessage,
        });
      } catch {
        // Ignore cleanup failures.
      }
    },
    [
      cancelRecordingMutation,
      clearTimer,
      resetSessionForNextRecording,
      setError,
      setMediaStream,
      setStatus,
      setWebcamDisconnected,
    ],
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
        message: 'Camera disconnected',
        errorCode: 'CAMERA_DISCONNECTED',
        failureCode: RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED,
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

  const startRecording = useCallback(
    async (noResiOverride?: string) => {
      if (noResiOverride) {
        setNoResi(noResiOverride);
      }

      const trimmedNoResi = (noResiOverride ?? useRecordingStore.getState().noResi).trim();

      if (!trimmedNoResi) {
        setError('Enter a tracking number (resi) before starting.', 'VALIDATION_ERROR');
        toast.warning('Tracking number required', {
          description: 'Enter a resi number to start recording.',
        });
        return;
      }

      const parsedNoResi = noResiSchema.safeParse(trimmedNoResi);

      if (!parsedNoResi.success) {
        const message = parsedNoResi.error.errors[0]?.message ?? 'Invalid resi number';
        setError(message, 'VALIDATION_ERROR');
        toast.warning('Invalid tracking number', { description: message });
        return;
      }

      if (isQuotaExceeded) {
        const message = resolveFailureFromCode(RECORDING_FAILURE_CODES.QUOTA_EXCEEDED);
        setError(message, 'QUOTA_EXCEEDED');
        toast.error('Storage quota exceeded', {
          description: 'Delete recordings or free up space before starting a new one.',
        });
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
    },
    [
      beginRecordingSession,
      cancelRecordingMutation,
      handleFailure,
      isQuotaExceeded,
      setCompletedRecording,
      setDurationSeconds,
      setError,
      setEstimatedFileSizeBytes,
      setMediaStream,
      setNoResi,
      setStatus,
      setUploadProgress,
      setWebcamDisconnected,
    ],
  );

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
      resetMetrics();

      await markUploadingMutation.mutateAsync(recordingId);

      abortUploadRef.current = new AbortController();

      const uploadResult = await uploadFile({
        file,
        signal: abortUploadRef.current.signal,
        onProgress: (event) => {
          setUploadProgress(event.percent);
          handleProgress(event);
        },
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
      releaseRecordingLock();
      toast.success('Recording uploaded successfully');
      await resetSessionForNextRecording();
    } catch (unknownError) {
      if (unknownError instanceof DOMException && unknownError.name === 'AbortError') {
        if (capturedBlob && capturedBlob.size > 0) {
          await handleRecoverableFailure({
            blob: capturedBlob,
            mimeType: capturedMimeType,
            recordingId,
            noResi: activeRecording.noResi,
            durationSeconds: useRecordingStore.getState().durationSeconds,
            message: resolveFailureFromCode(RECORDING_FAILURE_CODES.UPLOAD_CANCELLED),
            errorCode: 'UPLOAD_CANCELLED',
            failureCode: RECORDING_FAILURE_CODES.UPLOAD_CANCELLED,
            failureReason: 'Upload cancelled by operator',
            resetSession: true,
          });
          return;
        }

        await handleFailure(RecordingError.uploadFailed('Upload cancelled.'), recordingId);
        return;
      }

      const message = unknownError instanceof Error ? unknownError.message : 'Upload failed';
      const recordingError =
        unknownError instanceof RecordingError
          ? unknownError
          : RecordingError.fromUnknown(unknownError);

      if (recordingError.code === 'QUOTA_EXCEEDED' || message.toLowerCase().includes('quota')) {
        if (capturedBlob && capturedBlob.size > 0) {
          await handleRecoverableFailure({
            blob: capturedBlob,
            mimeType: capturedMimeType,
            recordingId,
            noResi: activeRecording.noResi,
            durationSeconds: useRecordingStore.getState().durationSeconds,
            message: resolveFailureFromCode(RECORDING_FAILURE_CODES.QUOTA_EXCEEDED),
            errorCode: 'QUOTA_EXCEEDED',
            failureCode: RECORDING_FAILURE_CODES.QUOTA_EXCEEDED,
            failureReason: recordingError.message,
            resetSession: true,
          });
          return;
        }

        await handleFailure(RecordingError.quotaExceeded(), recordingId);
        return;
      }

      if (capturedBlob && capturedBlob.size > 0 && isRecoverableUploadError(unknownError)) {
        const failure = resolveFailureFromError(unknownError);
        await handleRecoverableFailure({
          blob: capturedBlob,
          mimeType: capturedMimeType,
          recordingId,
          noResi: activeRecording.noResi,
          durationSeconds: useRecordingStore.getState().durationSeconds,
          message: failure.failureMessage,
          errorCode: 'UPLOAD_RECOVERABLE',
          failureCode: failure.failureCode,
          failureReason: failure.debugMessage,
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
    handleProgress,
    markUploadingMutation,
    resetMetrics,
    resetSessionForNextRecording,
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
    resetMetrics();
    useRecordingReliabilityStore.getState().setWebcamDisconnected(false);
    await recoverDefaultCameraPreview();
  }, [
    cancelRecordingMutation,
    cancelUpload,
    clearTimer,
    resetMetrics,
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
    uploadMetrics,
    isBusy:
      status === 'REQUESTING_PERMISSION' ||
      status === 'RECORDING' ||
      status === 'STOPPING' ||
      status === 'UPLOADING',
    canStart:
      (status === 'IDLE' || status === 'FAILED' || status === 'COMPLETED') && !isQuotaExceeded,
    canStop: status === 'RECORDING',
    startRecording,
    stopRecording,
    cancelUpload,
    reset,
    retryPermission,
  };
}
