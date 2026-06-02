'use client';

import { useOfflineDetection } from '../hooks/use-offline-detection';
import { OfflineBanner } from './offline-banner';
import { ReconnectBanner } from './reconnect-banner';
import { StaleLockWarning } from './stale-lock-warning';
import { WebcamDisconnectWarning } from './webcam-disconnect-warning';

type RecordingReliabilityShellProps = {
  children?: React.ReactNode;
};

/** Recording page banners (camera disconnect, offline, reconnect). */
export function RecordingReliabilityShell({ children }: RecordingReliabilityShellProps) {
  useOfflineDetection();

  return (
    <div className="space-y-4">
      <OfflineBanner />
      <ReconnectBanner />
      <StaleLockWarning />
      <WebcamDisconnectWarning />
      {children}
    </div>
  );
}
