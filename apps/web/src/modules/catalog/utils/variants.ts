import type { VariantBlockForm } from '../validators/add-variant';
import type { CreateVariantInput } from '../validators/variant';

/** The minimal shape variant grouping needs: its parent group, or null if standalone. */
type GroupableVariant = { variantGroup: string | null };

/** A row in the product-detail variant list: a standalone variant or a named group of subvariants. */
export type VariantBlock<T> =
  | { kind: 'single'; variant: T }
  | { kind: 'group'; name: string; variants: T[] };

/**
 * Lay variants out for display. A standalone variant (`variantGroup` null) becomes
 * a `single` block; subvariants sharing a `variantGroup` collapse into one `group`
 * block, placed where the group first appears. Original order is otherwise kept.
 */
export function buildVariantBlocks<T extends GroupableVariant>(variants: T[]): VariantBlock<T>[] {
  const blocks: VariantBlock<T>[] = [];
  const groupBlockIndex = new Map<string, number>();

  for (const variant of variants) {
    if (!variant.variantGroup) {
      blocks.push({ kind: 'single', variant });
      continue;
    }

    const index = groupBlockIndex.get(variant.variantGroup);
    if (index === undefined) {
      groupBlockIndex.set(variant.variantGroup, blocks.length);
      blocks.push({ kind: 'group', name: variant.variantGroup, variants: [variant] });
    } else {
      const block = blocks[index];
      if (block?.kind === 'group') block.variants.push(variant);
    }
  }

  return blocks;
}

/** Display label for a variant: "<group> · <name>" for a subvariant, else just the name. */
export function formatVariantLabel(variant: { variantGroup: string | null; name: string }): string {
  return variant.variantGroup ? `${variant.variantGroup} · ${variant.name}` : variant.name;
}

/**
 * Compact one name into a short SKU part: per word, keep the first letter and
 * drop the rest of the vowels (numbers stay whole). "iPhone 16" → "IPHN16".
 */
function compactSkuPart(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) =>
      /^[0-9]+$/.test(word) ? word : (word[0] ?? '') + word.slice(1).replace(/[AEIOU]/g, ''),
    )
    .join('');
}

/** Suggest a short SKU from variant (+ option) names, e.g. ("iPhone 16","Hitam") → "IPHN16-HTM". */
export function suggestVariantSku(...parts: string[]): string {
  return parts.map(compactSkuPart).filter(Boolean).join('-');
}

/** The separator that brands a soft-deleted variant's SKU (see {@link archivedSku}). */
const ARCHIVED_SKU_MARKER = '::deleted::';

/**
 * The SKU to store on a soft-deleted variant. The `@@unique([userId, sku])` index
 * spans archived rows too, so we mangle the SKU on delete to free the original for
 * reuse. The variant id keeps it unique; archived rows are never shown live.
 */
export function archivedSku(sku: string, variantId: string): string {
  return `${sku}${ARCHIVED_SKU_MARKER}${variantId}`;
}

/**
 * Recover a soft-deleted variant's original SKU by stripping the exact
 * `::deleted::<variantId>` suffix {@link archivedSku} appended. Keyed by the
 * variant id so it stays correct even if the original SKU itself contains the
 * marker; returns the stored value unchanged if the suffix is absent.
 */
export function unarchiveSku(storedSku: string, variantId: string): string {
  const suffix = `${ARCHIVED_SKU_MARKER}${variantId}`;
  return storedSku.endsWith(suffix) ? storedSku.slice(0, -suffix.length) : storedSku;
}

/** Stock/pricing fields shared by a standalone variant and a subvariant row. */
type VariantLeafFields = {
  sku: string;
  price: number;
  cost: number;
  initialStock: number;
  lowStockThreshold: number;
};

function toLeaf(
  name: string,
  variantGroup: string | null,
  fields: VariantLeafFields,
): CreateVariantInput {
  return {
    sku: fields.sku.trim(),
    name: name.trim(),
    variantGroup: variantGroup ?? undefined,
    price: fields.price,
    cost: fields.cost || undefined,
    lowStockThreshold: fields.lowStockThreshold,
    alertEnabled: true,
    initialStock: fields.initialStock,
  };
}

/**
 * Flatten one variant block into the leaf variants to create. A block with
 * options becomes one leaf per subvariant (sharing `variantGroup` = the variant
 * name); without options it is a single standalone leaf named after the variant.
 */
export function variantBlockToLeaves(block: VariantBlockForm): CreateVariantInput[] {
  if (!block.hasOptions) {
    return [toLeaf(block.variantName, null, block.single)];
  }
  return block.subvariants.map((subvariant) =>
    toLeaf(subvariant.name, block.variantName, subvariant),
  );
}

/** Flatten every variant block in a builder into the leaf variants to create. */
export function variantBlocksToLeaves(blocks: VariantBlockForm[]): CreateVariantInput[] {
  return blocks.flatMap(variantBlockToLeaves);
}
