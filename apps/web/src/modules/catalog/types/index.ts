/** A marketplace listing this variant is mapped to (links to the connection for unmapping). */
export type VariantMappingRef = {
  connectionId: string;
  provider: string;
  shopName: string;
};

export type ProductVariantItem = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  /** Parent variant name when this is a subvariant (e.g. "iPhone 16"); null = standalone. */
  variantGroup: string | null;
  /** Per-variant photo public URL; null = none. */
  imageUrl: string | null;
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
  /** Preferred supplier (purchasing); null = none. Drives the reorder lead-time/MOQ fallback. */
  supplierId: string | null;
  availableStock: number;
  /** Reserved for unshipped orders — deleting a variant with reserved stock is blocked. */
  reservedStock: number;
  /** Incoming from open purchase orders. */
  incomingStock: number;
  isLowStock: boolean;
  /** When a QR/barcode label was last printed for this variant; null = never. */
  labelPrintedAt: string | null;
  /** Marketplace listings mapped to this variant (empty = not mapped). */
  mappings: VariantMappingRef[];
  createdAt: string;
  updatedAt: string;
};

/** A printable variant row for the label studio — the QR encodes `barcode ?? sku`. */
export type LabelVariant = {
  variantId: string;
  productName: string;
  name: string;
  /** Parent group label when this is a subvariant; null = standalone. */
  variantGroup: string | null;
  sku: string;
  barcode: string | null;
  /** Decimal serialized as a string to avoid float precision loss. */
  price: string;
  /** Variant photo public URL; null = none. */
  imageUrl: string | null;
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

/** Why a product/variant/group can't (or can, with warnings) be deleted. */
export type DeletionBlockers = {
  /** True when at least one hard reason blocks deletion. */
  blocked: boolean;
  /** Hard blockers — mapping, reserved, incoming, open returns. */
  reasons: string[];
  /** Soft heads-up — on-hand and damaged stock that will be archived. */
  warnings: string[];
  /** How many active variants the check covered. */
  variantCount: number;
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

/** A soft-deleted variant shown in the product's archive, with its restorable original SKU. */
export type ArchivedVariantItem = {
  id: string;
  /** The original SKU (un-mangled), i.e. the one restore would reinstate. */
  sku: string;
  name: string;
  variantGroup: string | null;
  /** Whether restoring is possible — false when another live variant/bundle now uses `sku`. */
  restorable: boolean;
  /** When restore is blocked, why (so the UI can explain it); null otherwise. */
  blockReason: string | null;
  deletedAt: string;
};

/** A soft-deleted (archived) bundle, with its restorable original SKU and component count. */
export type ArchivedBundleItem = {
  id: string;
  /** The original SKU (un-mangled), i.e. the one restore would reinstate. */
  sku: string;
  name: string;
  imageUrl: string | null;
  /** Remaining components — 0 when the bundle was auto-archived after its last one was deleted. */
  componentCount: number;
  /** Whether restoring is possible — false when another live variant/bundle now uses `sku`. */
  restorable: boolean;
  /** When restore is blocked, why (so the UI can explain it); null otherwise. */
  blockReason: string | null;
  deletedAt: string;
};

/** A component line of a bundle: a variant + how many go into one bundle, with live stock. */
export type BundleComponentLine = {
  productVariantId: string;
  sku: string;
  name: string;
  quantity: number;
  availableStock: number;
  /** Component standard per-unit value (serialized Decimals) — drives price/cost allocation. */
  price: string;
  cost: string | null;
};

/** A bundle's full composition for the edit screen + how many it can currently fulfil. */
export type BundleDetail = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: string;
  isActive: boolean;
  imageUrl: string | null;
  components: BundleComponentLine[];
  /** How many whole bundles can be built from component stock. */
  available: number;
};

/** A resolved bundle for stock/price math (sale or PO explosion). Keyed by bundle id. */
export type BundleResolution = {
  id: string;
  name: string;
  sku: string;
  price: string;
  components: BundleComponentLine[];
  available: number;
};

/** Triage counts for the Bundles list (within the active search, ignoring the status filter). */
export type BundleListSummary = {
  total: number;
  available: number;
  unavailable: number;
};

/** A printable bundle row for the label studio — the QR encodes `barcode ?? sku`. */
export type BundleLabel = {
  bundleId: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: string;
  imageUrl: string | null;
  labelPrintedAt: string | null;
};

/** A bundle row in the dedicated Bundles list. */
export type BundleListItem = {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  price: string;
  isActive: boolean;
  /** How many distinct component variants the bundle groups. */
  totalVariant: number;
  available: number;
  /** When the bundle's QR label was last printed (ISO); null = never. */
  labelPrintedAt: string | null;
};
