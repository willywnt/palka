import { z } from 'zod';

import { ALLOWED_IMAGE_MIME_TYPES, MAX_PRODUCT_IMAGE_BYTES } from '../utils/image';

export const imagePresignSchema = z.object({
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  fileSizeBytes: z
    .number()
    .int('File size must be an integer')
    .positive('File size must be greater than zero')
    .max(MAX_PRODUCT_IMAGE_BYTES, 'Image exceeds the 5 MB limit'),
});

export type ImagePresignInput = z.infer<typeof imagePresignSchema>;
