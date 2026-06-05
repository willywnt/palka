export type ProductVariantItem = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  /** Parent variant name when this is a subvariant (e.g. "iPhone 16"); null = standalone. */
  variantGroup: string | null;
  barcode: string | null;
  /** Decimal serialized as a string to avoid float precision loss. */
  price: string;
  cost: string | null;
  weight: string | null;
  isActive: boolean;
  lowStockThreshold: number;
  alertEnabled: boolean;
  /** Supplier lead time (days); null = use the global reorder default. */
  leadTimeDays: number | null;
  /** Minimum reorder quantity (MOQ); null = no minimum. */
  minOrderQty: number | null;
  availableStock: number;
  /** Reserved for unshipped orders — deleting a variant with reserved stock is blocked. */
  reservedStock: number;
  /** Incoming from open purchase orders. */
  incomingStock: number;
  isLowStock: boolean;
  /** When a QR/barcode label was last printed for this variant; null = never. */
  labelPrintedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A printable variant row for the label studio — the QR encodes `barcode ?? sku`. */
export type LabelVariant = {
  variantId: string;
  productName: string;
  name: string;
  sku: string;
  barcode: string | null;
  /** Decimal serialized as a string to avoid float precision loss. */
  price: string;
  /** When a label was last printed for this variant; null = never. */
  labelPrintedAt: string | null;
};

export type ProductListItem = {
  id: string;
  name: string;
  category: string | null;
  isActive: boolean;
  variantCount: number;
  totalAvailableStock: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  variants: ProductVariantItem[];
  createdAt: string;
  updatedAt: string;
};
