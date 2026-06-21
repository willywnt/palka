import { z } from 'zod';

/** Set a variant's photo from a just-uploaded R2 object (key + its public URL). */
export const setVariantImageSchema = z.object({
  imageKey: z.string().trim().min(1).max(512),
  imageUrl: z.string().trim().url().max(1024),
  // The uploaded image's byte size (client blob.size — already capped at presign by
  // MAX_PRODUCT_IMAGE_BYTES). Persisted + billed against the org's storage quota.
  fileSizeBytes: z.number().int().nonnegative(),
});

export type SetVariantImageInput = z.infer<typeof setVariantImageSchema>;
