import type { SalePaymentMethod, SaleStatus } from '@prisma/client';

export type { SalePaymentMethod, SaleStatus };

/** A variant offered in the POS picker (catalog price + current sellable stock). */
export type SellableVariant = {
  variantId: string;
  sku: string;
  name: string;
  productName: string;
  price: string;
  availableStock: number;
  /** Variant photo public URL; null = none. */
  imageUrl: string | null;
};

export type SaleItemDetail = {
  id: string;
  productVariantId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
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
