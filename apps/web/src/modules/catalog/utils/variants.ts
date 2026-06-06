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

function slugifyPart(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Suggest a SKU by slugging + joining parts, e.g. ("iPhone","16","Hitam") → "IPHONE-16-HITAM". */
export function suggestVariantSku(...parts: string[]): string {
  return parts.map(slugifyPart).filter(Boolean).join('-');
}

/**
 * The SKU to store on a soft-deleted variant. The `@@unique([userId, sku])` index
 * spans archived rows too, so we mangle the SKU on delete to free the original for
 * reuse. The variant id keeps it unique; archived rows are never shown live.
 */
export function archivedSku(sku: string, variantId: string): string {
  return `${sku}::deleted::${variantId}`;
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
