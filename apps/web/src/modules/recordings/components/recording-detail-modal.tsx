'use client';

import Link from 'next/link';

import { useOrderByResiQuery } from '@/modules/orders/hooks/use-orders';

import type { RecordingDetail } from '../types';
import {
  formatRecordingDate,
  formatRecordingDuration,
  formatRecordingFileSize,
} from '../utils/recording-display';
import { getRecordingFailureDetail } from '../utils/recording-failure';
import { OperationalStatusBadge } from './operational-status-badge';
import { mapServerStatusToOperational } from '../types/operational-recording-status';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right font-medium">{value}</span>
    </div>
  );
}

export function RecordingDetailModal({
  recording,
  open,
  onOpenChange,
  isLoading,
}: {
  recording: RecordingDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading?: boolean;
}) {
  const failureDetail = recording
    ? getRecordingFailureDetail(recording.failureCode, recording.failureReason)
    : null;

  // Reverse link: the order this packing video belongs to (matched by resi).
  const { data: linkedOrder } = useOrderByResiQuery(recording?.noResi ?? null, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{recording?.noResi ?? 'Recording details'}</DialogTitle>
          <DialogDescription>Operational recording information</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : recording ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Status</span>
              <OperationalStatusBadge status={mapServerStatusToOperational(recording.status)} />
            </div>

            <Separator />

            <div className="space-y-3">
              <DetailRow label="Tracking number" value={recording.noResi} />
              {linkedOrder ? (
                <div className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Linked order</span>
                  <Link
                    href={`/dashboard/orders/${linkedOrder.id}`}
                    onClick={() => onOpenChange(false)}
                    className="text-primary max-w-[60%] text-right font-medium hover:underline"
                  >
                    {linkedOrder.externalOrderId} →
                  </Link>
                </div>
              ) : null}
              <DetailRow
                label="Duration"
                value={formatRecordingDuration(recording.durationSeconds)}
              />
              <DetailRow
                label="File size"
                value={formatRecordingFileSize(recording.fileSizeBytes)}
              />
              <DetailRow label="Created" value={formatRecordingDate(recording.createdAt)} />
              <DetailRow
                label="Uploaded"
                value={
                  recording.uploadedAt
                    ? formatRecordingDate(recording.uploadedAt)
                    : 'Not uploaded yet'
                }
              />
              <DetailRow
                label="Upload status"
                value={
                  recording.uploadedAt
                    ? 'Uploaded to storage'
                    : recording.status === 'FAILED'
                      ? 'Failed'
                      : 'In progress'
                }
              />
              {failureDetail ? <DetailRow label="Failure reason" value={failureDetail} /> : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
