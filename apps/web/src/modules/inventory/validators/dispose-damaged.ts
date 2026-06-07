import { z } from 'zod';

/** Write off some damaged-bucket units; the service clamps to what's held. */
export const disposeDamagedSchema = z.object({
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1')
    .max(1_000_000_000),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});

export type DisposeDamagedInput = z.infer<typeof disposeDamagedSchema>;
