import { MarketplaceProvider } from '@prisma/client';
import { z } from 'zod';

export const oauthCallbackQuerySchema = z.object({
  code: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  error: z.string().trim().optional(),
  error_description: z.string().trim().optional(),
});

export type OAuthCallbackQueryInput = z.infer<typeof oauthCallbackQuerySchema>;

export const oauthProviderParamSchema = z.object({
  provider: z.nativeEnum(MarketplaceProvider),
});

export type OAuthProviderParamInput = z.infer<typeof oauthProviderParamSchema>;

export const oauthStartQuerySchema = z.object({
  returnUrl: z.string().url().optional(),
  redirect: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  accountId: z.string().cuid().optional(),
});

export type OAuthStartQueryInput = z.infer<typeof oauthStartQuerySchema>;

export const oauthReconnectParamSchema = z.object({
  id: z.string().cuid(),
});

export type OAuthReconnectParamInput = z.infer<typeof oauthReconnectParamSchema>;
