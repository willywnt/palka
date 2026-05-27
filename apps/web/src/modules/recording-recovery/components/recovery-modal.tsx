'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { useUploadRetry } from '../hooks/use-upload-retry';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';
import {
  formatRecoveryDate,
  formatRecoveryDuration,
  formatRecoveryFileSize,
} from '../utils/format';
import { UploadProgressBar } from '@/modules/recordings/components/upload-progress';

const UPLOAD_STATUS_LABELS = {
  PENDING: 'Pending',
  UPLOADING: 'Uploading',
  FAILED: 'Failed',
  COMPLETED: 'Completed',
} as const;

export function RecoveryModal() {
  const recoveryModalOpen = useRecordingReliabilityStore((state) => state.recoveryModalOpen);
  const selectedRecoveryId = useRecordingReliabilityStore((state) => state.selectedRecoveryId);
  const temporaryRecordings = useRecordingReliabilityStore((state) => state.temporaryRecordings);
  const closeRecoveryModal = useRecordingReliabilityStore((state) => state.closeRecoveryModal);
  const isRetryingUpload = useRecordingReliabilityStore((state) => state.isRetryingUpload);
  const retryUploadProgress = useRecordingReliabilityStore((state) => state.retryUploadProgress);
  const isOnline = useRecordingReliabilityStore((state) => state.isOnline);

  const { retryUpload, discardRecording } = useUploadRetry();

  const selectedRecording =
    temporaryRecordings.find((recording) => recording.id === selectedRecoveryId) ??
    temporaryRecordings[0] ??
    null;

  return (
    <Dialog
      open={recoveryModalOpen && temporaryRecordings.length > 0}
      onOpenChange={(open) => {
        if (!open) closeRecoveryModal();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recover local recording</DialogTitle>
          <DialogDescription>
            Unfinished recordings were found on this device. Retry upload or discard them — uploads
            never start automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-3 overflow-y-auto">
          {temporaryRecordings.map((recording) => {
            const isSelected = selectedRecording?.id === recording.id;

            return (
              <div
                key={recording.id}
                className={`rounded-lg border p-3 text-sm ${isSelected ? 'border-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{recording.noResi}</p>
                    <p className="text-muted-foreground mt-1">
                      {formatRecoveryDate(recording.createdAt)} ·{' '}
                      {formatRecoveryDuration(recording.durationSeconds)} ·{' '}
                      {formatRecoveryFileSize(recording.estimatedSizeBytes)}
                    </p>
                  </div>
                  <Badge
                    variant={recording.uploadStatus === 'FAILED' ? 'destructive' : 'secondary'}
                  >
                    {UPLOAD_STATUS_LABELS[recording.uploadStatus]}
                  </Badge>
                </div>
                {recording.failureReason ? (
                  <p className="text-destructive mt-2 text-xs">{recording.failureReason}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        {isRetryingUpload ? <UploadProgressBar progress={retryUploadProgress} /> : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            disabled={isRetryingUpload || !selectedRecording}
            onClick={() => {
              if (selectedRecording) void discardRecording(selectedRecording.id);
            }}
          >
            Discard
          </Button>
          <Button
            disabled={isRetryingUpload || !selectedRecording || !isOnline}
            onClick={() => {
              if (selectedRecording) void retryUpload(selectedRecording.id);
            }}
          >
            Retry upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
