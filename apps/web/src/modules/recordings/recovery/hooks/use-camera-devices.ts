'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { recordingService } from '@/modules/recordings/services/recording.service';
import { useRecordingStore } from '@/modules/recordings/store/recording.store';

import {
  getFirstCameraDeviceId,
  isDeviceInList,
  listVideoInputDevices,
} from '../services/camera-devices.service';
import type { CameraDeviceOption } from '../types';
import {
  activateCameraStream,
  isStreamLive,
  recoverDefaultCameraPreview,
} from '../utils/camera-stream';
import { useRecordingReliabilityStore } from '../store/recording-reliability.store';

const PREVIEW_BLOCKED_STATUSES = new Set([
  'REQUESTING_PERMISSION',
  'RECORDING',
  'STOPPING',
  'UPLOADING',
]);

export function useCameraDevices() {
  const [devices, setDevices] = useState<CameraDeviceOption[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const selectFirstInFlightRef = useRef(false);

  const status = useRecordingStore((state) => state.status);
  const mediaStream = useRecordingStore((state) => state.mediaStream);
  const setMediaStream = useRecordingStore((state) => state.setMediaStream);

  const webcamDisconnected = useRecordingReliabilityStore((state) => state.webcamDisconnected);
  const setWebcamDisconnected = useRecordingReliabilityStore(
    (state) => state.setWebcamDisconnected,
  );
  const setPreferredCameraDeviceId = useRecordingReliabilityStore(
    (state) => state.setPreferredCameraDeviceId,
  );
  const cameraRecoveryToken = useRecordingReliabilityStore((state) => state.cameraRecoveryToken);

  const canPreviewCamera = !PREVIEW_BLOCKED_STATUSES.has(status);

  const refreshDevices = useCallback(async () => {
    const nextDevices = await listVideoInputDevices();
    setDevices(nextDevices);
    return nextDevices;
  }, []);

  const applyCameraStream = useCallback(
    async (deviceId: string | null) => {
      const stream = await activateCameraStream(deviceId);
      const resolvedDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;

      setMediaStream(stream);
      setActiveDeviceId(resolvedDeviceId);
      setPreferredCameraDeviceId(resolvedDeviceId);
      setWebcamDisconnected(false);
      return stream;
    },
    [setMediaStream, setPreferredCameraDeviceId, setWebcamDisconnected],
  );

  const selectFirstCamera = useCallback(
    async (deviceList?: CameraDeviceOption[]) => {
      const currentStatus = useRecordingStore.getState().status;
      if (PREVIEW_BLOCKED_STATUSES.has(currentStatus) || selectFirstInFlightRef.current) {
        return false;
      }

      selectFirstInFlightRef.current = true;
      setIsSwitching(true);

      try {
        return await recoverDefaultCameraPreview();
      } finally {
        selectFirstInFlightRef.current = false;
        setIsSwitching(false);
        const nextDevices = deviceList ?? (await refreshDevices());
        setDevices(nextDevices);
        const stream = useRecordingStore.getState().mediaStream;
        const resolvedId = stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
        if (resolvedId) {
          setActiveDeviceId(resolvedId);
        }
      }
    },
    [refreshDevices],
  );

  const switchCamera = useCallback(
    async (deviceId?: string) => {
      const currentStatus = useRecordingStore.getState().status;
      if (PREVIEW_BLOCKED_STATUSES.has(currentStatus)) return;

      const nextDevices = devices.length > 0 ? devices : await refreshDevices();
      const targetDeviceId = deviceId ?? getFirstCameraDeviceId(nextDevices);
      if (!targetDeviceId) return;

      setIsSwitching(true);

      try {
        await applyCameraStream(targetDeviceId);
      } finally {
        setIsSwitching(false);
      }
    },
    [applyCameraStream, devices, refreshDevices],
  );

  useEffect(() => {
    void refreshDevices();

    const handleDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
  }, [refreshDevices]);

  useEffect(() => {
    const stream = recordingService.getStream() ?? mediaStream;
    const videoTrack = stream?.getVideoTracks()[0];
    const settings = videoTrack?.getSettings();

    if (settings?.deviceId) {
      setActiveDeviceId(settings.deviceId);
      setPreferredCameraDeviceId(settings.deviceId);
    }
  }, [mediaStream, setPreferredCameraDeviceId, status]);

  useEffect(() => {
    if (!canPreviewCamera) return;

    void (async () => {
      const nextDevices = await refreshDevices();
      if (nextDevices.length === 0) return;

      const currentStream = recordingService.getStream() ?? mediaStream;
      const needsCamera =
        webcamDisconnected ||
        !currentStream ||
        !isStreamLive(currentStream) ||
        (activeDeviceId !== null && !isDeviceInList(nextDevices, activeDeviceId));

      if (needsCamera) {
        await selectFirstCamera(nextDevices);
      }
    })();
  }, [
    activeDeviceId,
    canPreviewCamera,
    mediaStream,
    refreshDevices,
    selectFirstCamera,
    webcamDisconnected,
  ]);

  useEffect(() => {
    if (!canPreviewCamera) return;
    void selectFirstCamera();
  }, [cameraRecoveryToken, canPreviewCamera, selectFirstCamera]);

  return {
    devices,
    activeDeviceId,
    isSwitching,
    canPreviewCamera,
    showCameraPicker: devices.length > 0 && canPreviewCamera,
    showCameraRecovery: webcamDisconnected && devices.length > 0,
    refreshDevices,
    selectFirstCamera,
    switchCamera,
  };
}
