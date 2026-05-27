'use client';

import { AlertTriangle } from 'lucide-react';

import { useRecordingReliabilityStore } from '../store/recording-reliability.store';

export function StaleLockWarning() {
  const staleLockCleared = useRecordingReliabilityStore((state) => state.staleLockCleared);

  if (!staleLockCleared) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Stale recording lock cleared</p>
        <p className="mt-1 opacity-90">
          A previous recording session was interrupted. You can start a new recording safely.
        </p>
      </div>
    </div>
  );
}
