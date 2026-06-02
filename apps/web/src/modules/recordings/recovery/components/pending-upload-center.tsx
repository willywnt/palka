'use client';

import { useState } from 'react';
import { ArrowLeft, ChevronRight, Play, Trash2, UploadCloud } from 'lucide-react';

import type { TemporaryRecording } from '../types';
import { resolvePendingRecordingFailureMessage } from '../types/failure-codes';
import { useUploadRetry } from '../hooks/use-upload-retry';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';
import {
  formatRecoveryDate,
  formatRecoveryDuration,
  formatRecoveryFileSize,
} from '../utils/format';
import { OperationalStatusBadge } from '@/modules/recordings/components/operational-status-badge';
import { mapRecoveryUploadToOperational } from '@/modules/recordings/types/operational-recording-status';
import { UploadProgressBar } from '@/modules/recordings/components/upload-progress';
import { PendingLocalPlayerModal } from './pending-local-player-modal';
import { PendingRecordingDetailPanel } from './pending-recording-detail-panel';
import { PendingDiscardDialog } from './pending-discard-dialog';
import { ActionTooltip, EllipsisTooltip } from '@/components/ui/action-tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

function PendingRecordingRow({
  recording,
  isRetrying,
  retryProgress,
  isOnline,
  onPreview,
  onDetails,
  onRetry,
  onDiscard,
}: {
  recording: TemporaryRecording;
  isRetrying: boolean;
  retryProgress: number;
  isOnline: boolean;
  onPreview: () => void;
  onDetails: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const status = mapRecoveryUploadToOperational(recording.uploadStatus);
  const failureMessage = resolvePendingRecordingFailureMessage(recording);

  return (
    <div className="bg-card rounded-lg border p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold tracking-tight">{recording.noResi}</p>
            <OperationalStatusBadge status={status} />
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatRecoveryDate(recording.createdAt)} ·{' '}
            {formatRecoveryDuration(recording.durationSeconds)} ·{' '}
            {formatRecoveryFileSize(recording.estimatedSizeBytes)}
          </p>
          {failureMessage ? (
            <EllipsisTooltip
              text={failureMessage}
              className="text-destructive text-xs leading-snug"
              contentClassName="max-w-sm"
            />
          ) : null}
        </div>
        <ActionTooltip label="View upload activity timeline">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onDetails}>
            <ChevronRight className="size-4" />
            <span className="sr-only">View timeline</span>
          </Button>
        </ActionTooltip>
      </div>

      {isRetrying ? (
        <div className="mt-3">
          <UploadProgressBar progress={retryProgress} label="Uploading" />
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <ActionTooltip label="Playback the recording">
          <Button size="sm" variant="outline" onClick={onPreview}>
            <Play className="size-3.5" />
            Preview
          </Button>
        </ActionTooltip>
        <ActionTooltip label="Upload this recording to cloud storage">
          <Button size="sm" variant="default" disabled={!isOnline || isRetrying} onClick={onRetry}>
            <UploadCloud className="size-3.5" />
            Upload
          </Button>
        </ActionTooltip>
        <ActionTooltip label="Discard this recording">
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={isRetrying}
            onClick={onDiscard}
          >
            <Trash2 className="size-3.5" />
            Discard
          </Button>
        </ActionTooltip>
      </div>
    </div>
  );
}

/** Button / icon to open the pending upload sidebar. */
export function PendingUploadTrigger({
  showLabel = true,
  iconOnly = false,
}: {
  showLabel?: boolean;
  iconOnly?: boolean;
}) {
  const pendingCount = useRecordingReliabilityStore((state) => state.temporaryRecordings.length);
  const setUploadCenterOpen = useRecordingReliabilityStore((state) => state.setUploadCenterOpen);

  if (pendingCount === 0) {
    return null;
  }

  return (
    <Button
      variant={pendingCount > 0 ? 'default' : 'outline'}
      size={iconOnly ? 'icon' : 'sm'}
      className={iconOnly ? 'relative' : undefined}
      onClick={() => setUploadCenterOpen(true)}
    >
      <UploadCloud className="size-4" />
      {showLabel && !iconOnly ? 'Pending uploads' : null}
      {pendingCount > 0 ? (
        <Badge
          variant={iconOnly ? 'destructive' : 'secondary'}
          className={
            iconOnly ? 'absolute -top-1 -right-1 size-5 justify-center px-0 text-[10px]' : 'ml-2'
          }
        >
          {pendingCount}
        </Badge>
      ) : null}
      {iconOnly ? <span className="sr-only">Pending uploads ({pendingCount})</span> : null}
    </Button>
  );
}

/** Sidebar sheet + preview/detail modals — mount once globally. */
export function PendingUploadProvider() {
  const temporaryRecordings = useRecordingReliabilityStore((state) => state.temporaryRecordings);
  const selectedRecoveryId = useRecordingReliabilityStore((state) => state.selectedRecoveryId);
  const setSelectedRecoveryId = useRecordingReliabilityStore(
    (state) => state.setSelectedRecoveryId,
  );
  const isRetryingUpload = useRecordingReliabilityStore((state) => state.isRetryingUpload);
  const retryUploadProgress = useRecordingReliabilityStore((state) => state.retryUploadProgress);
  const isOnline = useRecordingReliabilityStore((state) => state.isOnline);
  const uploadCenterOpen = useRecordingReliabilityStore((state) => state.uploadCenterOpen);
  const setUploadCenterOpen = useRecordingReliabilityStore((state) => state.setUploadCenterOpen);

  const { retryUpload, discardRecording } = useUploadRetry();

  const [sheetView, setSheetView] = useState<'list' | 'detail'>('list');
  const [detailRecording, setDetailRecording] = useState<TemporaryRecording | null>(null);
  const [playerTarget, setPlayerTarget] = useState<TemporaryRecording | null>(null);
  const [discardTarget, setDiscardTarget] = useState<TemporaryRecording | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const pendingCount = temporaryRecordings.length;
  const retryingId = isRetryingUpload ? selectedRecoveryId : null;

  function openDetails(recording: TemporaryRecording) {
    setDetailRecording(recording);
    setSheetView('detail');
  }

  function closeSheet(open: boolean) {
    setUploadCenterOpen(open);
    if (!open) {
      setSheetView('list');
      setDetailRecording(null);
    }
  }

  async function handleDiscardConfirm() {
    if (!discardTarget) return;

    setIsDiscarding(true);
    try {
      await discardRecording(discardTarget.id);
      if (detailRecording?.id === discardTarget.id) {
        setDetailRecording(null);
        setSheetView('list');
      }
      setDiscardTarget(null);
    } finally {
      setIsDiscarding(false);
    }
  }

  return (
    <>
      <Sheet open={uploadCenterOpen} onOpenChange={closeSheet}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          {sheetView === 'list' ? (
            <>
              <SheetHeader className="space-y-1 border-b px-6 py-5 text-left">
                <SheetTitle className="text-lg">Pending uploads</SheetTitle>
                <SheetDescription>
                  {pendingCount > 0
                    ? `${pendingCount} recording(s) saved on this device waiting to upload.`
                    : 'No pending uploads on this device.'}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-3">
                  {temporaryRecordings.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Recordings that fail to upload are saved here for upload.
                    </p>
                  ) : (
                    temporaryRecordings.map((recording) => (
                      <PendingRecordingRow
                        key={recording.id}
                        recording={recording}
                        isRetrying={retryingId === recording.id}
                        retryProgress={retryUploadProgress}
                        isOnline={isOnline}
                        onPreview={() => setPlayerTarget(recording)}
                        onDetails={() => openDetails(recording)}
                        onRetry={() => {
                          setSelectedRecoveryId(recording.id);
                          void retryUpload(recording.id);
                        }}
                        onDiscard={() => setDiscardTarget(recording)}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          ) : detailRecording ? (
            <>
              <div className="border-b px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1"
                  onClick={() => {
                    setSheetView('list');
                    setDetailRecording(null);
                  }}
                >
                  <ArrowLeft className="size-4" />
                  Back to list
                </Button>
              </div>
              <div className="border-b px-6 py-4">
                <h2 className="text-lg font-semibold">Upload timeline</h2>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <PendingRecordingDetailPanel recording={detailRecording} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <PendingLocalPlayerModal
        recording={playerTarget}
        open={Boolean(playerTarget)}
        onOpenChange={(open) => !open && setPlayerTarget(null)}
      />

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

/** @deprecated Use PendingUploadTrigger + PendingUploadProvider */
export function PendingUploadCenter() {
  return <PendingUploadProvider />;
}
