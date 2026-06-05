import { z } from 'zod';

/** Soft-delete one variant (single id) or a whole group (its leaf ids) at once. */
export const deleteVariantsSchema = z.object({
  variantIds: z.array(z.string().cuid()).min(1).max(50),
});

export type DeleteVariantsInput = z.infer<typeof deleteVariantsSchema>;
