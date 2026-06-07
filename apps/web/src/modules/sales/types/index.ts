import type { SalePaymentMethod, SaleStatus } from '@prisma/client';

import type { BundleResolution } from '@/modules/catalog/types';

export type { SalePaymentMethod, SaleStatus };

/** A variant offered in the POS picker (catalog price + current sellable stock). */
export type SellableVariant = {
  variantId: string;
  sku: string;
  name: string;
  productName: string;
  /** Parent group label when this is a subvariant; null = standalone. */
  variantGroup: string | null;
  price: string;
  availableStock: number;
  /** Units on order from suppliers (not yet received). */
  incomingStock: number;
  /** Variant photo public URL; null = none. */
  imageUrl: string | null;
};

/** What a scanned POS code resolves to — a standalone variant or a whole bundle. */
export type ScannedSaleItem =
  | { kind: 'variant'; variant: SellableVariant }
  | { kind: 'bundle'; bundle: BundleResolution };

export type SaleItemDetail = {
  id: string;
  productVariantId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  /** Snapshot of the bundle this line came from (null = a standalone variant line). */
  bundleName: string | null;
  /** Variant photo public URL; null = none. */
  imageUrl: string | null;
};

export type SaleListItem = {
  id: string;
  code: string;
  customerName: string | null;
  paymentMethod: SalePaymentMethod;
  status: SaleStatus;
  totalAmount: string;
  itemCount: number;
  createdAt: string;
};

export type SaleDetail = SaleListItem & {
  note: string | null;
  items: SaleItemDetail[];
};
