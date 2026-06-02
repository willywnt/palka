'use client';

import {
  formatEta,
  formatUploadSpeed,
  type UploadProgressMetrics,
} from '../hooks/use-upload-progress-metrics';
import { formatRecoveryFileSize } from '@/modules/recordings/recovery/utils/format';

export function UploadProgressBar({
  progress,
  label = 'Uploading recording',
  metrics,
}: {
  progress: number;
  label?: string;
  metrics?: UploadProgressMetrics;
}) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{safeProgress}%</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-all duration-200"
          style={{ width: `${safeProgress}%` }}
        />
      </div>
      {metrics ? (
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>{formatUploadSpeed(metrics.speedBytesPerSecond)}</span>
          <span>{formatEta(metrics.estimatedSecondsRemaining)}</span>
          {metrics.totalBytes > 0 ? (
            <span>
              {formatRecoveryFileSize(metrics.loadedBytes)} /{' '}
              {formatRecoveryFileSize(metrics.totalBytes)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EstimatedFileSize({ bytes }: { bytes: number }) {
  return (
    <p className="text-muted-foreground text-sm">
      Estimated size:{' '}
      <span className="text-foreground font-medium">{formatRecoveryFileSize(bytes)}</span>
    </p>
  );
}
