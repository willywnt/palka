import { z } from 'zod';

export const reconnectMarketplaceAccountSchema = z.object({
  accessToken: z.string().trim().min(1, 'Access token is required').max(4096),
  refreshToken: z
    .string()
    .trim()
    .max(4096)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  expiresAt: z.coerce.date().nullable().optional(),
  storeName: z.string().trim().min(1).max(200).optional(),
});

export type ReconnectMarketplaceAccountInput = z.infer<typeof reconnectMarketplaceAccountSchema>;

export const reconnectMarketplaceAccountFormSchema = z.object({
  accessToken: z.string().trim().min(1, 'Access token is required').max(4096),
  refreshToken: z.string().trim().max(4096).optional(),
  expiresAt: z.date().nullable(),
  storeName: z.string().trim().min(1).max(200).optional(),
});

export type ReconnectMarketplaceAccountFormInput = z.infer<
  typeof reconnectMarketplaceAccountFormSchema
>;
