'use client';

import type { TemporaryRecording } from '../types';
import { resolvePendingRecordingFailureMessage } from '../types/failure-codes';
import { RecordingTimelineList } from './recording-timeline-list';
import { OperationalStatusBadge } from '@/modules/recordings/components/operational-status-badge';
import { mapRecoveryUploadToOperational } from '@/modules/recordings/types/operational-recording-status';

type PendingRecordingDetailPanelProps = {
  recording: TemporaryRecording;
};

export function PendingRecordingDetailPanel({ recording }: PendingRecordingDetailPanelProps) {
  const status = mapRecoveryUploadToOperational(recording.uploadStatus);
  const failureMessage = resolvePendingRecordingFailureMessage(recording);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-semibold tracking-tight">{recording.noResi}</h3>
          <OperationalStatusBadge status={status} />
        </div>
        {failureMessage ? (
          <p className="text-destructive text-sm leading-snug">{failureMessage}</p>
        ) : null}
      </div>

      <div>
        <p className="mb-4 text-sm font-medium">Timeline</p>
        <RecordingTimelineList events={recording.timeline} />
      </div>
    </div>
  );
}
