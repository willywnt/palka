/**
 * Shared cart-line shapes for the POS terminal and its presentational cart
 * children. The variant is the SKU/stock leaf; a bundle line carries its
 * exploded components so the oversell math (in the parent) sees them.
 */

/** A single component variant a bundle line will consume (for oversell math + display). */
export type BundleCartComponent = {
  productVariantId: string;
  name: string;
  quantity: number;
  availableStock: number;
};

export type VariantCartLine = {
  kind: 'variant';
  variantId: string;
  sku: string;
  name: string;
  productName: string;
  variantGroup: string | null;
  unitPrice: number;
  /** Unit cost (modal) snapshot; null = unknown — drives the below-cost warning. */
  cost: number | null;
  quantity: number;
  availableStock: number;
  incomingStock: number;
  imageUrl: string | null;
};

export type BundleCartLine = {
  kind: 'bundle';
  bundleId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  components: BundleCartComponent[];
};

export type CartLine = VariantCartLine | BundleCartLine;
