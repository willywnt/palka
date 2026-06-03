'use client';

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { RecordingReliabilityShell } from '@/modules/recordings/recovery/components/recording-reliability-shell';
import { recoverDefaultCameraPreview } from '@/modules/recordings/recovery/utils/camera-stream';
import { useAnotherTabRecording } from '@/modules/recordings/recovery/hooks/use-another-tab-recording';
import { useCameraDevices } from '@/modules/recordings/recovery/hooks/use-camera-devices';

import { useRecording } from '../hooks/use-recording';
import { useDuplicateResiWarning } from '../hooks/use-duplicate-resi-warning';
import { RecordingControls } from './recording-controls';
import { RecordingLifecycleStatusBadge } from './recording-lifecycle-status-badge';
import { RecordingTimer } from './recording-timer';
import { EstimatedFileSize, UploadProgressBar } from './upload-progress';
import { WebcamPreview } from './webcam-preview';
import { CameraHealthIndicator } from './camera-health-indicator';
import { LocalStorageUsageIndicator } from './local-storage-usage-indicator';
import { StorageQuotaIndicator } from '@/modules/storage/components/storage-quota-indicator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConnectScannerDialog } from '@/modules/scanner-pairing/components/connect-scanner-dialog';
import { RecordingCountdownModal } from '@/modules/scanner-pairing/components/recording-countdown-modal';
import { ScannerStatusWidget } from '@/modules/scanner-pairing/components/scanner-status-widget';
import { useScannerAutoRecording } from '@/modules/scanner-pairing/hooks/use-scanner-auto-recording';
import { useDesktopScannerSocket } from '@/modules/scanner-pairing/hooks/use-desktop-scanner-socket';
import { useDesktopStationRecordingSync } from '@/modules/scanner-pairing/hooks/use-desktop-station-recording-sync';
import { useActivePairingQuery } from '@/modules/scanner-pairing/hooks/use-pairing-api';
import { isMobileScannerEnabled } from '@/modules/scanner-pairing/config';

export function RecordingPanel() {
  const {
    status,
    noResi,
    setNoResi,
    durationSeconds,
    uploadProgress,
    uploadMetrics,
    estimatedFileSizeBytes,
    mediaStream,
    error,
    completedRecording,
    isBusy,
    canStart,
    canStop,
    startRecording,
    stopRecording,
    cancelUpload,
    reset,
    retryPermission,
  } = useRecording();

  const { devices, activeDeviceId, showCameraPicker, isSwitching, switchCamera } =
    useCameraDevices();
  const anotherTabRecording = useAnotherTabRecording();
  const { duplicateWarning, checkDuplicate, clearDuplicateWarning } = useDuplicateResiWarning();

  const pendingStartRef = useRef(false);
  const [pairingDialogOpen, setPairingDialogOpen] = useState(false);

  // Hidden in production until the realtime socket host is deployed.
  const scannerEnabled = isMobileScannerEnabled();
  const { data: activePairing } = useActivePairingQuery(scannerEnabled);
  const pairingSession = scannerEnabled ? (activePairing?.session ?? null) : null;

  const {
    handleBarcodeScanned,
    cancelCountdown,
    startCountdownNow,
    scannerDuplicateWarning,
    clearScannerDuplicateWarning,
    confirmScannerDuplicateAndCountdown,
  } = useScannerAutoRecording({
    setNoResi,
    startRecording,
    canStart: canStart && !anotherTabRecording,
  });

  useDesktopScannerSocket(pairingSession?.id ?? null, handleBarcodeScanned);
  useDesktopStationRecordingSync(pairingSession?.id ?? null);

  useEffect(() => {
    void recoverDefaultCameraPreview();
  }, []);

  const runStartRecording = useCallback(async () => {
    const trimmedNoResi = noResi.trim();

    if (!trimmedNoResi) {
      await startRecording();
      return;
    }

    const isDuplicate = await checkDuplicate(trimmedNoResi);
    if (isDuplicate) {
      pendingStartRef.current = true;
      return;
    }

    await startRecording();
  }, [checkDuplicate, noResi, startRecording]);

  const isRecording = status === 'RECORDING';
  const isPermissionDenied = error?.toLowerCase().includes('permission');

  return (
    <RecordingReliabilityShell>
      <div className="space-y-4">
        <StorageQuotaIndicator variant="warning-only" />
        <LocalStorageUsageIndicator />

        {scannerEnabled ? (
          <ScannerStatusWidget onConnectClick={() => setPairingDialogOpen(true)} />
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Webcam recording</CardTitle>
              <CardDescription>
                Enter a tracking number (resi), then record and upload to storage.
              </CardDescription>
            </div>
            <RecordingLifecycleStatusBadge status={status} />
          </CardHeader>
          <CardContent className="space-y-6">
            <CameraHealthIndicator />

            {anotherTabRecording ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                Recording is already active in another tab. Close that tab or wait for its session
                to finish before starting here.
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <WebcamPreview stream={mediaStream} isRecording={isRecording} />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="noResi">Tracking number (resi)</Label>
                  <Input
                    id="noResi"
                    placeholder="Enter resi number"
                    value={noResi}
                    onChange={(event) => setNoResi(event.target.value.toUpperCase())}
                    disabled={isBusy}
                    autoComplete="off"
                  />
                </div>

                {showCameraPicker ? (
                  <div className="space-y-2">
                    <Label>Camera</Label>
                    <div className="flex flex-wrap gap-2">
                      {devices.map((device) => (
                        <Button
                          key={device.deviceId}
                          type="button"
                          variant={device.deviceId === activeDeviceId ? 'default' : 'outline'}
                          size="sm"
                          disabled={isSwitching}
                          onClick={() => void switchCamera(device.deviceId)}
                        >
                          {device.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <RecordingTimer durationSeconds={durationSeconds} isRecording={isRecording} />
                <EstimatedFileSize bytes={estimatedFileSizeBytes} />

                {status === 'UPLOADING' ? (
                  <UploadProgressBar
                    progress={uploadProgress}
                    label="Uploading recording"
                    metrics={uploadMetrics}
                  />
                ) : null}

                {error ? (
                  <div className="border-destructive/30 bg-destructive/5 text-destructive flex gap-3 rounded-lg border p-3 text-sm">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">{error}</p>
                      {isPermissionDenied ? (
                        <p className="mt-1">
                          Check browser camera permissions, then click Retry camera.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {completedRecording ? (
                  <div className="border-primary/30 bg-primary/5 flex gap-3 rounded-lg border p-3 text-sm">
                    <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">Recording saved for {completedRecording.noResi}</p>
                      <Button variant="link" className="h-auto p-0" asChild>
                        <Link
                          href={`/dashboard/recordings?search=${encodeURIComponent(completedRecording.noResi)}`}
                        >
                          View recording in library
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : null}

                <RecordingControls
                  canStart={canStart && !anotherTabRecording}
                  canStop={canStop}
                  isBusy={isBusy}
                  status={status}
                  onStart={() => void runStartRecording()}
                  onStop={() => void stopRecording()}
                  onReset={() => void reset()}
                  onRetryPermission={() => void retryPermission()}
                  onCancelUpload={cancelUpload}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {scannerEnabled ? (
        <>
          <ConnectScannerDialog open={pairingDialogOpen} onOpenChange={setPairingDialogOpen} />
          <RecordingCountdownModal onCancel={cancelCountdown} onStartNow={startCountdownNow} />
        </>
      ) : null}

      <AlertDialog
        open={Boolean(scannerDuplicateWarning)}
        onOpenChange={(open) => !open && clearScannerDuplicateWarning()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate tracking number</AlertDialogTitle>
            <AlertDialogDescription>
              {scannerDuplicateWarning
                ? `${scannerDuplicateWarning.noResi} was recorded in the last 24 hours. Start recording anyway?`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={clearScannerDuplicateWarning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmScannerDuplicateAndCountdown}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(duplicateWarning)}
        onOpenChange={(open) => !open && clearDuplicateWarning()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recently recorded tracking number</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateWarning
                ? `Tracking number ${duplicateWarning.noResi} was recorded recently. Continue anyway?`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={clearDuplicateWarning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearDuplicateWarning();
                if (pendingStartRef.current) {
                  pendingStartRef.current = false;
                  void startRecording();
                }
              }}
            >
              Continue anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RecordingReliabilityShell>
  );
}
