export type ProductVariantItem = {
  id: string;
  productId: string;
  sku: string;
  name: string;
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
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
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
