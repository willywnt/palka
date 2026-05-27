'use client';

import { VideoOff } from 'lucide-react';

import { useRecordingReliabilityStore } from '../store/recording-reliability.store';

export function WebcamDisconnectWarning() {
  const webcamDisconnected = useRecordingReliabilityStore((state) => state.webcamDisconnected);

  if (!webcamDisconnected) return null;

  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
    >
      <VideoOff className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Camera disconnected.</p>
        <p className="mt-1 opacity-90">
          Your recording was safely preserved locally. Discard it from the recovery dialog to
          automatically switch to the first available camera.
        </p>
      </div>
    </div>
  );
}
