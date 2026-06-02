'use client';

import { WifiOff } from 'lucide-react';

import { useRecordingReliabilityStore } from '../store/recording-reliability.store';

export function OfflineBanner() {
  const isOnline = useRecordingReliabilityStore((state) => state.isOnline);
  const hasTemporaryRecordings = useRecordingReliabilityStore(
    (state) => state.temporaryRecordings.length > 0,
  );

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      <WifiOff className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Internet disconnected.</p>
        <p className="mt-1 opacity-90">
          {hasTemporaryRecordings
            ? 'Your recording is safely stored locally. You can upload it again after reconnecting.'
            : 'Uploads will fail until your connection is restored. Active recordings are stored locally when possible.'}
        </p>
      </div>
    </div>
  );
}
