import type { PairingPurpose, PairingSessionStatus } from '@prisma/client';

export type PairingDeviceInfo = {
  userAgent?: string;
  platform?: string;
  language?: string;
  screen?: string;
};

export type PairingSessionSummary = {
  id: string;
  status: PairingSessionStatus;
  /**
   * Which station the phone drives. Optional because socket-only session updates
   * (`toPairingSessionSummaryFromEvent`) omit it to avoid clobbering the value
   * the HTTP query seeded into the cache.
   */
  purpose?: PairingPurpose;
  connectedAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string;
  deviceInfo: PairingDeviceInfo | null;
  lastScanAt: string | null;
  lastBarcode: string | null;
  createdAt: string;
};

export type CreatePairingSessionResult = {
  session: PairingSessionSummary;
  connectUrl: string;
  qrPayload: string;
};

export type ActivePairingSessionResult = {
  session: PairingSessionSummary | null;
  connectUrl: string | null;
};

export type BarcodeScannedPayload = {
  barcode: string;
  scannedAt: string;
};

export type ScannerConnectionState = 'idle' | 'pending' | 'connected' | 'disconnected' | 'expired';
