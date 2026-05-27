'use client';

import { Wifi } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useUploadRetry } from '../hooks/use-upload-retry';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';

export function ReconnectBanner() {
  const showReconnectPrompt = useRecordingReliabilityStore((state) => state.showReconnectPrompt);
  const temporaryRecordings = useRecordingReliabilityStore((state) => state.temporaryRecordings);
  const resetReconnectPrompt = useRecordingReliabilityStore((state) => state.resetReconnectPrompt);
  const openRecoveryModal = useRecordingReliabilityStore((state) => state.openRecoveryModal);
  const isRetryingUpload = useRecordingReliabilityStore((state) => state.isRetryingUpload);

  const { retryUpload } = useUploadRetry();

  if (!showReconnectPrompt || temporaryRecordings.length === 0) return null;

  const firstPending = temporaryRecordings.find(
    (recording) => recording.uploadStatus === 'PENDING' || recording.uploadStatus === 'FAILED',
  );

  return (
    <div
      role="alert"
      className="border-primary/40 bg-primary/10 flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <Wifi className="text-primary mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Connection restored.</p>
          <p className="text-muted-foreground mt-1">Retry upload?</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => resetReconnectPrompt()}>
          Dismiss
        </Button>
        {firstPending ? (
          <Button
            size="sm"
            disabled={isRetryingUpload}
            onClick={() => void retryUpload(firstPending.id)}
          >
            Retry upload
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => openRecoveryModal()}>
            View recordings
          </Button>
        )}
      </div>
    </div>
  );
}
