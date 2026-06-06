import { z } from 'zod';

/** Set a product's photo from a just-uploaded R2 object (key + its public URL). */
export const setProductImageSchema = z.object({
  imageKey: z.string().trim().min(1).max(512),
  imageUrl: z.string().trim().url().max(1024),
});

export type SetProductImageInput = z.infer<typeof setProductImageSchema>;
