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
