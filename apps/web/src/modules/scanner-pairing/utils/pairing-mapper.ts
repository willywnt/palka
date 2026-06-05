import type { PairingSession } from '@prisma/client';

import type { PairingDeviceInfo, PairingSessionSummary } from '../types';

function parseDeviceInfo(value: unknown): PairingDeviceInfo | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    userAgent: typeof record.userAgent === 'string' ? record.userAgent : undefined,
    platform: typeof record.platform === 'string' ? record.platform : undefined,
    language: typeof record.language === 'string' ? record.language : undefined,
    screen: typeof record.screen === 'string' ? record.screen : undefined,
  };
}

export function toPairingSessionSummary(session: PairingSession): PairingSessionSummary {
  return {
    id: session.id,
    status: session.status,
    purpose: session.purpose,
    connectedAt: session.connectedAt?.toISOString() ?? null,
    lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString(),
    deviceInfo: parseDeviceInfo(session.deviceInfo),
    lastScanAt: session.lastScanAt?.toISOString() ?? null,
    lastBarcode: session.lastBarcode,
    createdAt: session.createdAt.toISOString(),
  };
}
