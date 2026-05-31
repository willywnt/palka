import { MarketplaceProvider } from '@prisma/client';
import { z } from 'zod';

export const connectMarketplaceAccountSchema = z.object({
  provider: z.nativeEnum(MarketplaceProvider),
  externalStoreId: z.string().trim().min(1, 'Store ID is required').max(100),
  storeName: z.string().trim().min(1, 'Store name is required').max(200),
  accessToken: z.string().trim().min(1, 'Access token is required').max(4096),
  refreshToken: z
    .string()
    .trim()
    .max(4096)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  expiresAt: z.coerce.date().nullable().optional(),
});

export type ConnectMarketplaceAccountInput = z.infer<typeof connectMarketplaceAccountSchema>;

export const connectMarketplaceAccountFormSchema = z.object({
  provider: z.nativeEnum(MarketplaceProvider),
  externalStoreId: z.string().trim().min(1, 'Store ID is required').max(100),
  storeName: z.string().trim().min(1, 'Store name is required').max(200),
  accessToken: z.string().trim().min(1, 'Access token is required').max(4096),
  refreshToken: z.string().trim().max(4096).optional(),
  expiresAt: z.date().nullable(),
});

export type ConnectMarketplaceAccountFormInput = z.infer<
  typeof connectMarketplaceAccountFormSchema
>;

/** @deprecated Use ConnectMarketplaceAccountInput */
export type CreateMarketplaceConnectionInput = ConnectMarketplaceAccountInput;

/** @deprecated Use connectMarketplaceAccountFormSchema */
export const createMarketplaceConnectionFormSchema = connectMarketplaceAccountFormSchema;

/** @deprecated Use ConnectMarketplaceAccountFormInput */
export type CreateMarketplaceConnectionFormInput = ConnectMarketplaceAccountFormInput;

/** @deprecated Use connectMarketplaceAccountSchema */
export const createMarketplaceConnectionSchema = connectMarketplaceAccountSchema;
