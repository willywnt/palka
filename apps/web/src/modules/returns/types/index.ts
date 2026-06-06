import type { MarketplaceProvider, ReturnDisposition, ReturnStatus } from '@prisma/client';

export type { ReturnStatus, ReturnDisposition };

export type ReturnItemDetail = {
  id: string;
  orderItemId: string;
  productVariantId: string | null;
  sku: string | null;
  variantName: string | null;
  productName: string | null;
  /** Variant photo public URL; null = none / unresolved. */
  imageUrl: string | null;
  externalName: string;
  quantity: number;
  disposition: ReturnDisposition | null;
};

export type ReturnListItem = {
  id: string;
  orderId: string;
  externalOrderId: string;
  provider: MarketplaceProvider;
  shopName: string;
  status: ReturnStatus;
  noResi: string | null;
  reason: string | null;
  autoDetected: boolean;
  itemCount: number;
  createdAt: string;
  processedAt: string | null;
};

export type ReturnDetail = ReturnListItem & { items: ReturnItemDetail[] };
