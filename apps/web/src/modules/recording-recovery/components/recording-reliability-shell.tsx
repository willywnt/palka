'use client';

import { useOfflineDetection } from '../hooks/use-offline-detection';
import { useRecoveryBootstrap } from '../hooks/use-recovery-bootstrap';
import { OfflineBanner } from './offline-banner';
import { ReconnectBanner } from './reconnect-banner';
import { RecoveryModal } from './recovery-modal';
import { StaleLockWarning } from './stale-lock-warning';
import { WebcamDisconnectWarning } from './webcam-disconnect-warning';

type RecordingReliabilityShellProps = {
  children?: React.ReactNode;
};

export function RecordingReliabilityShell({ children }: RecordingReliabilityShellProps) {
  useOfflineDetection();
  useRecoveryBootstrap();

  return (
    <div className="space-y-4">
      <OfflineBanner />
      <ReconnectBanner />
      <StaleLockWarning />
      <WebcamDisconnectWarning />
      {children}
      <RecoveryModal />
    </div>
  );
}
