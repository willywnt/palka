'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ActionTooltip, EllipsisTooltip } from '@/components/ui/action-tooltip';

import { useUploadRetry } from '../hooks/use-upload-retry';
import { recordingRecoveryService } from '../services/recording-recovery.service';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';
import { resolvePendingRecordingFailureMessage } from '../types/failure-codes';
import type { TemporaryRecording } from '../types';
import {
  formatRecoveryDate,
  formatRecoveryDuration,
  formatRecoveryFileSize,
} from '../utils/format';
import { UploadProgressBar } from '@/modules/recordings/components/upload-progress';
import { OperationalStatusBadge } from '@/modules/recordings/components/operational-status-badge';
import { mapRecoveryUploadToOperational } from '@/modules/recordings/types/operational-recording-status';
import { PendingDiscardDialog } from './pending-discard-dialog';

export function RecoveryModal() {
  const recoveryModalOpen = useRecordingReliabilityStore((state) => state.recoveryModalOpen);
  const selectedRecoveryId = useRecordingReliabilityStore((state) => state.selectedRecoveryId);
  const setSelectedRecoveryId = useRecordingReliabilityStore(
    (state) => state.setSelectedRecoveryId,
  );
  const temporaryRecordings = useRecordingReliabilityStore((state) => state.temporaryRecordings);
  const closeRecoveryModal = useRecordingReliabilityStore((state) => state.closeRecoveryModal);
  const setUploadCenterOpen = useRecordingReliabilityStore((state) => state.setUploadCenterOpen);
  const isRetryingUpload = useRecordingReliabilityStore((state) => state.isRetryingUpload);
  const retryUploadProgress = useRecordingReliabilityStore((state) => state.retryUploadProgress);
  const isOnline = useRecordingReliabilityStore((state) => state.isOnline);

  const { retryUpload, discardRecording } = useUploadRetry();

  const [discardTarget, setDiscardTarget] = useState<TemporaryRecording | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const selectedRecording =
    temporaryRecordings.find((recording) => recording.id === selectedRecoveryId) ??
    temporaryRecordings[0] ??
    null;

  async function dismissModal() {
    await recordingRecoveryService.setRecoveryModalDismissed(true);
    closeRecoveryModal();
  }

  async function handleDiscardConfirm() {
    if (!discardTarget) return;

    setIsDiscarding(true);
    try {
      await discardRecording(discardTarget.id);
      setDiscardTarget(null);
      await dismissModal();
    } finally {
      setIsDiscarding(false);
    }
  }

  return (
    <>
      <Dialog
        open={recoveryModalOpen && temporaryRecordings.length > 0}
        onOpenChange={(open) => {
          if (!open) void dismissModal();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pending uploads need attention</DialogTitle>
            <DialogDescription>
              Unfinished recordings were saved on this device. Upload or discard them — uploads
              never start automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-3 overflow-y-auto">
            {temporaryRecordings.map((recording) => {
              const isSelected = selectedRecording?.id === recording.id;
              const status = mapRecoveryUploadToOperational(recording.uploadStatus);
              const failureMessage = resolvePendingRecordingFailureMessage(recording);

              return (
                <button
                  key={recording.id}
                  type="button"
                  onClick={() => setSelectedRecoveryId(recording.id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{recording.noResi}</p>
                      <p className="text-muted-foreground mt-1">
                        {formatRecoveryDate(recording.createdAt)} ·{' '}
                        {formatRecoveryDuration(recording.durationSeconds)} ·{' '}
                        {formatRecoveryFileSize(recording.estimatedSizeBytes)}
                      </p>
                    </div>
                    <OperationalStatusBadge status={status} />
                  </div>
                  {failureMessage ? (
                    <EllipsisTooltip
                      text={failureMessage}
                      className="text-destructive mt-2 text-xs leading-snug"
                      contentClassName="max-w-sm"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          {isRetryingUpload ? (
            <UploadProgressBar progress={retryUploadProgress} label="Uploading" />
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => {
                void dismissModal();
                setUploadCenterOpen(true);
              }}
            >
              Open upload center
            </Button>
            <div className="flex gap-2">
              <ActionTooltip label="Discard the selected recording">
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={isRetryingUpload || !selectedRecording}
                  onClick={() => {
                    if (selectedRecording) setDiscardTarget(selectedRecording);
                  }}
                >
                  Discard
                </Button>
              </ActionTooltip>
              <ActionTooltip label="Upload the selected recording to cloud storage">
                <Button
                  variant="default"
                  disabled={isRetryingUpload || !selectedRecording || !isOnline}
                  onClick={() => {
                    if (selectedRecording)
                      void retryUpload(selectedRecording.id).then(dismissModal);
                  }}
                >
                  Upload
                </Button>
              </ActionTooltip>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PendingDiscardDialog
        noResi={discardTarget?.noResi ?? null}
        open={Boolean(discardTarget)}
        onOpenChange={(open) => !open && setDiscardTarget(null)}
        onConfirm={() => void handleDiscardConfirm()}
        isDiscarding={isDiscarding}
      />
    </>
  );
}
