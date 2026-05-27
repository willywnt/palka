'use client';

import { AlertCircle, CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RecordingReliabilityShell } from '@/modules/recording-recovery/components/recording-reliability-shell';
import { useAnotherTabRecording } from '@/modules/recording-recovery/hooks/use-another-tab-recording';
import { useCameraDevices } from '@/modules/recording-recovery/hooks/use-camera-devices';

import { useRecording } from '../hooks/use-recording';
import { RecordingControls } from './recording-controls';
import { RecordingLifecycleStatusBadge } from './recording-lifecycle-status-badge';
import { RecordingTimer } from './recording-timer';
import { EstimatedFileSize, UploadProgressBar } from './upload-progress';
import { WebcamPreview } from './webcam-preview';

export function RecordingPanel() {
  const {
    status,
    noResi,
    setNoResi,
    durationSeconds,
    uploadProgress,
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

  const isRecording = status === 'RECORDING';
  const isPermissionDenied = error?.toLowerCase().includes('permission');

  return (
    <RecordingReliabilityShell>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Webcam Recording</CardTitle>
            <CardDescription>
              Enter a resi number, start recording, then upload directly to storage when you stop.
            </CardDescription>
          </div>
          <RecordingLifecycleStatusBadge status={status} />
        </CardHeader>
        <CardContent className="space-y-6">
          {anotherTabRecording ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              Recording is already active in another tab. Close that tab or wait for its session to
              expire before starting here.
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <WebcamPreview stream={mediaStream} isRecording={isRecording} />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="noResi">Resi number</Label>
                <Input
                  id="noResi"
                  placeholder="ABC123"
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

              {status === 'UPLOADING' ? <UploadProgressBar progress={uploadProgress} /> : null}

              {error ? (
                <div className="border-destructive/30 bg-destructive/5 text-destructive flex gap-3 rounded-lg border p-3 text-sm">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">{error}</p>
                    {isPermissionDenied ? (
                      <p className="mt-1">
                        Check your browser camera permissions, then click Retry.
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
                    <p className="text-muted-foreground mt-1 break-all">
                      {completedRecording.publicUrl}
                    </p>
                  </div>
                </div>
              ) : null}

              <RecordingControls
                canStart={canStart && !anotherTabRecording}
                canStop={canStop}
                isBusy={isBusy}
                status={status}
                onStart={() => void startRecording()}
                onStop={() => void stopRecording()}
                onReset={() => void reset()}
                onRetryPermission={() => void retryPermission()}
                onCancelUpload={cancelUpload}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </RecordingReliabilityShell>
  );
}
