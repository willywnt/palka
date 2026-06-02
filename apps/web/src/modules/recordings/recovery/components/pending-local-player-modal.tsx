'use client';

import { useEffect, useRef, useState } from 'react';

import type { TemporaryRecording } from '../types';
import { recordingRecoveryService } from '../services/recording-recovery.service';
import { mapRecoveryUploadToOperational } from '@/modules/recordings/types/operational-recording-status';
import {
  RecordingPreviewShell,
  type RecordingPreviewMeta,
} from '@/modules/recordings/components/recording-preview-shell';

type PendingLocalPlayerModalProps = {
  recording: TemporaryRecording | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PendingLocalPlayerModal({
  recording,
  open,
  onOpenChange,
}: PendingLocalPlayerModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const recordingId = recording?.id;

  useEffect(() => {
    if (!open || !recordingId) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setObjectUrl(null);
      setLoadError(null);
      return;
    }

    const activeRecordingId = recordingId;
    let cancelled = false;

    async function loadBlob() {
      setIsLoading(true);
      setLoadError(null);

      const blob = await recordingRecoveryService.getTemporaryRecordingBlob(activeRecordingId);
      if (cancelled) return;

      if (!blob) {
        setLoadError('Unable to load local preview.');
        setIsLoading(false);
        return;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setObjectUrl(url);
      setIsLoading(false);
    }

    void loadBlob();

    return () => {
      cancelled = true;
    };
  }, [open, recordingId]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const meta: RecordingPreviewMeta | null = recording
    ? {
        noResi: recording.noResi,
        status: mapRecoveryUploadToOperational(recording.uploadStatus),
        durationSeconds: recording.durationSeconds,
        fileSizeBytes: recording.estimatedSizeBytes,
        recordedAt: recording.createdAt,
        retryCount: recording.retryCount,
      }
    : null;

  return (
    <RecordingPreviewShell
      open={open}
      onOpenChange={onOpenChange}
      meta={meta}
      videoSrc={objectUrl}
      videoKey={recording?.id}
      mimeType={recording?.mimeType}
      isLoading={isLoading}
      errorMessage={loadError}
      onRetry={() => {
        if (recording) {
          setObjectUrl(null);
          setLoadError(null);
          void recordingRecoveryService.getTemporaryRecordingBlob(recording.id).then((blob) => {
            if (!blob) {
              setLoadError('Unable to load local preview.');
              return;
            }
            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;
            setObjectUrl(url);
          });
        }
      }}
    />
  );
}
