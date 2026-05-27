import type { CameraDeviceOption } from '../types';

export async function listVideoInputDevices(): Promise<CameraDeviceOption[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();

  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

export function getFirstCameraDeviceId(devices: CameraDeviceOption[]): string | null {
  const withStableId = devices.find((device) => device.deviceId.length > 0);
  return withStableId?.deviceId ?? devices[0]?.deviceId ?? null;
}

export function isDeviceInList(devices: CameraDeviceOption[], deviceId: string | null): boolean {
  if (!deviceId) return false;
  return devices.some((device) => device.deviceId === deviceId);
}

export function getRecoveryCameraDeviceId(
  devices: CameraDeviceOption[],
  options?: { excludeDeviceId?: string | null },
): string | null {
  if (options?.excludeDeviceId) {
    const alternate = devices.find(
      (device) => device.deviceId.length > 0 && device.deviceId !== options.excludeDeviceId,
    );
    if (alternate?.deviceId) {
      return alternate.deviceId;
    }
  }

  return getFirstCameraDeviceId(devices);
}

export function hasAlternateCamera(
  devices: CameraDeviceOption[],
  activeDeviceId: string | null,
): boolean {
  if (devices.length <= 1) return false;
  if (!activeDeviceId) return devices.length > 1;
  return devices.some((device) => device.deviceId !== activeDeviceId);
}

export function getNextCameraDeviceId(
  devices: CameraDeviceOption[],
  activeDeviceId: string | null,
): string | null {
  if (devices.length <= 1) return null;

  const currentIndex = devices.findIndex((device) => device.deviceId === activeDeviceId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % devices.length : 0;
  return devices[nextIndex]?.deviceId ?? null;
}
