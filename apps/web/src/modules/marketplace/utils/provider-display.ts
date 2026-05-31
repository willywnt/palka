import type { MarketplaceProvider } from '@prisma/client';
import type { LucideIcon } from 'lucide-react';
import { ShoppingBag, Store, Video } from 'lucide-react';

export const MARKETPLACE_PROVIDER_LABELS: Record<MarketplaceProvider, string> = {
  SHOPEE: 'Shopee',
  TOKOPEDIA: 'Tokopedia',
  TIKTOK: 'TikTok Shop',
  LAZADA: 'Lazada',
};

export const MARKETPLACE_PROVIDER_DESCRIPTIONS: Record<MarketplaceProvider, string> = {
  SHOPEE: 'Connect a Shopee seller store for future inventory and order sync.',
  TOKOPEDIA: 'Connect a Tokopedia shop for future inventory and order sync.',
  TIKTOK: 'TikTok Shop integration — coming soon.',
  LAZADA: 'Lazada integration — coming soon.',
};

export const MARKETPLACE_PROVIDER_ICONS: Record<MarketplaceProvider, LucideIcon> = {
  SHOPEE: ShoppingBag,
  TOKOPEDIA: Store,
  TIKTOK: Video,
  LAZADA: Store,
};

export function getMarketplaceProviderLabel(provider: MarketplaceProvider): string {
  return MARKETPLACE_PROVIDER_LABELS[provider] ?? provider;
}

export function getMarketplaceProviderIcon(provider: MarketplaceProvider): LucideIcon {
  return MARKETPLACE_PROVIDER_ICONS[provider] ?? Store;
}
