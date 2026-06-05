import { z } from 'zod';

import { createVariantSchema } from './variant';

const MAX_MONEY = 9_999_999_999;
const MAX_STOCK = 1_000_000_000;
/** A grouped variant may hold at most this many subvariants. */
export const MAX_SUBVARIANTS = 50;
/** A product / add request may hold at most this many variant blocks. */
export const MAX_VARIANT_BLOCKS = 50;

/**
 * Bulk add: the flat leaf variants to create — a standalone variant (single leaf)
 * or a grouped variant (one leaf per subvariant, sharing a variantGroup). The
 * dialogs flatten their variant blocks into this before sending.
 */
export const addVariantsSchema = z.object({
  variants: z
    .array(createVariantSchema)
    .min(1)
    .max(MAX_SUBVARIANTS * MAX_VARIANT_BLOCKS),
});

export type AddVariantsInput = z.infer<typeof addVariantsSchema>;

const money = () => z.coerce.number().nonnegative('Must be 0 or more').max(MAX_MONEY);
const stock = () => z.coerce.number().int().nonnegative().max(MAX_STOCK);

/** One subvariant row inside a variant block. */
const subvariantRowSchema = z.object({
  name: z.string().trim().max(200),
  sku: z.string().trim().max(64),
  price: money(),
  cost: money(),
  initialStock: stock(),
  lowStockThreshold: stock(),
});

/**
 * One variant block in the builder: a variant name plus either a single SKU
 * (hasOptions off) or a list of subvariants (hasOptions on). The active branch's
 * required fields and duplicate option names are enforced via superRefine.
 */
export const variantBlockSchema = z
  .object({
    variantName: z.string().trim().min(1, 'Variant name is required').max(200),
    hasOptions: z.boolean(),
    single: z.object({
      sku: z.string().trim().max(64),
      price: money(),
      cost: money(),
      initialStock: stock(),
      lowStockThreshold: stock(),
    }),
    subvariants: z.array(subvariantRowSchema).max(MAX_SUBVARIANTS),
  })
  .superRefine((data, ctx) => {
    if (!data.hasOptions) {
      if (!data.single.sku.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['single', 'sku'],
          message: 'SKU is required',
        });
      }
      return;
    }

    if (data.subvariants.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subvariants'],
        message: 'Add at least one option',
      });
    }

    const names = data.subvariants.map((row) => row.name.trim().toLowerCase());
    data.subvariants.forEach((row, index) => {
      if (!row.name.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subvariants', index, 'name'],
          message: 'Required',
        });
      }
      if (!row.sku.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subvariants', index, 'sku'],
          message: 'Required',
        });
      }
      const name = names[index] ?? '';
      if (name && names.indexOf(name) !== index) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subvariants', index, 'name'],
          message: 'Duplicate option',
        });
      }
    });
  });

export type VariantBlockForm = z.infer<typeof variantBlockSchema>;

/** Form-facing schema for the add-variant dialog: one or more variant blocks. */
export const addVariantFormSchema = z.object({
  variants: z.array(variantBlockSchema).min(1).max(MAX_VARIANT_BLOCKS),
});

export type AddVariantFormInput = z.infer<typeof addVariantFormSchema>;
