'use client';

import {
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  MoreHorizontal,
  Play,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EllipsisTooltip } from '@/components/ui/action-tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUploadRetry } from '@/modules/recordings/recovery/hooks/use-upload-retry';
import { useRecordingReliabilityStore } from '@/modules/recordings/recovery/store/recording-reliability.store';
import { resolvePendingRecordingFailureMessage } from '@/modules/recordings/recovery/types/failure-codes';
import {
  formatRecoveryDate,
  formatRecoveryDuration,
  formatRecoveryFileSize,
} from '@/modules/recordings/recovery/utils/format';
import type { TemporaryRecording } from '@/modules/recordings/recovery/types';

import { OperationalStatusBadge } from './operational-status-badge';
import { mapRecoveryUploadToOperational } from '../types/operational-recording-status';
import { usePersistedToggle } from '../hooks/use-persisted-toggle';

const PENDING_SECTION_STORAGE_KEY = 'olshop-pending-uploads-expanded';

type PendingUploadsSectionProps = {
  recordings: TemporaryRecording[];
  onPreview: (recording: TemporaryRecording) => void;
  onViewTimeline: (recording: TemporaryRecording) => void;
  onDiscard: (recording: TemporaryRecording) => void;
};

/**
 * Collapsible table of recordings saved locally on this device that have not yet
 * reached cloud storage (upload recovery). Owns its expand/collapse + retry state;
 * the parent owns the preview/timeline/discard modals via the callbacks.
 */
export function PendingUploadsSection({
  recordings,
  onPreview,
  onViewTimeline,
  onDiscard,
}: PendingUploadsSectionProps) {
  const isOnline = useRecordingReliabilityStore((state) => state.isOnline);
  const isRetryingUpload = useRecordingReliabilityStore((state) => state.isRetryingUpload);
  const selectedRecoveryId = useRecordingReliabilityStore((state) => state.selectedRecoveryId);
  const retryUploadProgress = useRecordingReliabilityStore((state) => state.retryUploadProgress);
  const setSelectedRecoveryId = useRecordingReliabilityStore(
    (state) => state.setSelectedRecoveryId,
  );
  const { retryUpload } = useUploadRetry();
  const { value: expanded, toggle } = usePersistedToggle(PENDING_SECTION_STORAGE_KEY, true);

  if (recordings.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border">
      <button
        type="button"
        className="hover:bg-muted/40 flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
        onClick={toggle}
      >
        <div>
          <p className="text-sm font-medium">Pending uploads</p>
          <p className="text-muted-foreground text-xs">
            {recordings.length} saved on this device — not yet in cloud storage
          </p>
        </div>
        <div className="text-muted-foreground flex items-center gap-2">
          <Badge variant="secondary">{recordings.length}</Badge>
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>
      </button>

      {expanded ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resi</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Failure reason</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>File size</TableHead>
              <TableHead>Recorded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordings.map((recording) => {
              const failureMessage = resolvePendingRecordingFailureMessage(recording);
              const isUploadingThis = isRetryingUpload && selectedRecoveryId === recording.id;
              const status = isUploadingThis
                ? 'UPLOADING'
                : mapRecoveryUploadToOperational(recording.uploadStatus);

              return (
                <TableRow key={recording.id} className="bg-muted/20">
                  <TableCell className="font-medium">{recording.noResi}</TableCell>
                  <TableCell>
                    <OperationalStatusBadge status={status} />
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    {failureMessage ? (
                      <EllipsisTooltip
                        text={failureMessage}
                        className="text-destructive text-sm leading-snug"
                        contentClassName="max-w-sm"
                      />
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>{formatRecoveryDuration(recording.durationSeconds)}</TableCell>
                  <TableCell>{formatRecoveryFileSize(recording.estimatedSizeBytes)}</TableCell>
                  <TableCell>{formatRecoveryDate(recording.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {isUploadingThis ? (
                      <div
                        className="inline-flex items-center gap-2"
                        role="status"
                        aria-label={`Uploading ${retryUploadProgress}%`}
                      >
                        <Loader2 className="text-primary size-4 animate-spin" />
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {retryUploadProgress}%
                        </span>
                      </div>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Open actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onPreview(recording)}>
                            <Play className="size-4" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!isOnline || isRetryingUpload}
                            onClick={() => {
                              setSelectedRecoveryId(recording.id);
                              void retryUpload(recording.id);
                            }}
                          >
                            <UploadCloud className="size-4" />
                            Upload
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onViewTimeline(recording)}>
                            <Eye className="size-4" />
                            View timeline
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={isRetryingUpload}
                            onClick={() => onDiscard(recording)}
                          >
                            <Trash2 className="size-4" />
                            Discard
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
