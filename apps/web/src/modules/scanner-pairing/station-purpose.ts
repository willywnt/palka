import type { PairingPurpose } from '@prisma/client';

/**
 * Single source of purpose-aware copy for the shared pairing UI. The same socket
 * flow drives two very different stations — packing-video recordings and the POS
 * till — so the desktop dialog and the phone screen read from here to stay
 * informative instead of generic ("Mobile scanner").
 */
export type StationPurposeMeta = {
  /** Desktop-facing name of the station this pairing drives. */
  label: string;
  /** Compact name for chips/badges. */
  shortLabel: string;
  /** What the connect dialog tells the operator the phone will do. */
  description: string;
  /** Title shown on the phone scanner screen. */
  mobileTitle: string;
  /** What to point the phone camera at. */
  scanHint: string;
  /** Phone status copy while linking to the station. */
  connectingLabel: string;
  /** Phone error copy when the station is unreachable. */
  unreachableLabel: string;
  /** Phone toast description after a successful scan. */
  mobileScanSuccess: (barcode: string) => string;
};

export const STATION_PURPOSE_META: Record<PairingPurpose, StationPurposeMeta> = {
  RECORDING: {
    label: 'Recording station',
    shortLabel: 'Recording',
    description: 'Scan a shipping-label barcode to auto-start the packing video.',
    mobileTitle: 'Packing scanner',
    scanHint: 'Point at the shipping-label barcode (resi)',
    connectingLabel: 'Linking to the recording station…',
    unreachableLabel: 'Could not reach the recording station.',
    mobileScanSuccess: (barcode) => `${barcode} — recording on the desktop`,
  },
  POS: {
    label: 'POS terminal',
    shortLabel: 'POS',
    description: 'Scan a product QR or barcode label to add it to the cart.',
    mobileTitle: 'Product scanner',
    scanHint: 'Point at a product QR or barcode label',
    connectingLabel: 'Linking to the POS terminal…',
    unreachableLabel: 'Could not reach the POS terminal.',
    mobileScanSuccess: (barcode) => `${barcode} — added to the cart`,
  },
};

/** Meta for a purpose, defaulting to recordings (the legacy/back-compat station). */
export function stationPurposeMeta(purpose: PairingPurpose | null | undefined): StationPurposeMeta {
  return STATION_PURPOSE_META[purpose ?? 'RECORDING'];
}
