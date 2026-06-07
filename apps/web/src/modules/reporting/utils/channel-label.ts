import type { ProfitChannel } from '../types';

/** Display names for each sales channel (POS + marketplace providers). */
export const CHANNEL_LABELS: Record<string, string> = {
  POS: 'Kasir',
  SHOPEE: 'Shopee',
  TOKOPEDIA: 'Tokopedia',
  LAZADA: 'Lazada',
};

/** A channel's human label, falling back to the raw key for any future provider. */
export function channelLabel(channel: ProfitChannel | string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}
