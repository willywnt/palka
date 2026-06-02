import { recordingService } from '@/modules/recordings/services/recording.service';
import { useRecordingStore } from '@/modules/recordings/store/recording.store';

import {
  getRecoveryCameraDeviceId,
  listVideoInputDevices,
} from '../services/camera-devices.service';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';

const PREVIEW_BLOCKED_STATUSES = new Set([
  'REQUESTING_PERMISSION',
  'RECORDING',
  'STOPPING',
  'UPLOADING',
]);

export async function activateCameraStream(deviceId?: string | null): Promise<MediaStream> {
  recordingService.cleanup();
  return recordingService.requestStream(deviceId || undefined);
}

export async function resolveRecordingStream(
  preferredDeviceId?: string | null,
): Promise<MediaStream> {
  const existing = recordingService.getStream();
  const track = existing?.getVideoTracks()[0];

  if (track?.readyState === 'live' && existing) {
    const currentId = track.getSettings().deviceId;
    if (!preferredDeviceId || !currentId || currentId === preferredDeviceId) {
      return existing;
    }
  }

  return activateCameraStream(preferredDeviceId);
}

export function isStreamLive(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0];
  return track?.readyState === 'live';
}

export async function recoverDefaultCameraPreview(): Promise<boolean> {
  const status = useRecordingStore.getState().status;
  if (PREVIEW_BLOCKED_STATUSES.has(status)) {
    return false;
  }

  const reliability = useRecordingReliabilityStore.getState();
  const devices = await listVideoInputDevices();

  if (devices.length === 0) {
    return false;
  }

  const excludeDeviceId = reliability.webcamDisconnected
    ? reliability.preferredCameraDeviceId
    : null;
  const targetDeviceId = getRecoveryCameraDeviceId(devices, { excludeDeviceId });

  try {
    const stream = await activateCameraStream(targetDeviceId);
    const resolvedDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? targetDeviceId;

    useRecordingStore.getState().setMediaStream(stream);
    reliability.setPreferredCameraDeviceId(resolvedDeviceId);
    reliability.setWebcamDisconnected(false);

    return isStreamLive(stream);
  } catch {
    try {
      const stream = await activateCameraStream(null);
      const resolvedDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;

      useRecordingStore.getState().setMediaStream(stream);
      reliability.setPreferredCameraDeviceId(resolvedDeviceId);
      reliability.setWebcamDisconnected(false);

      return isStreamLive(stream);
    } catch {
      useRecordingStore.getState().setMediaStream(null);
      return false;
    }
  }
}
