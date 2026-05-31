import { MarketplaceMappingStatus } from '@prisma/client';
import { z } from 'zod';

export const importMarketplaceProductsSchema = z.object({
  dryRun: z.boolean().optional().default(false),
});

export type ImportMarketplaceProductsInput = z.infer<typeof importMarketplaceProductsSchema>;

export const listMarketplaceProductsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  unmappedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
});

export type ListMarketplaceProductsQuery = z.infer<typeof listMarketplaceProductsQuerySchema>;

export const createMappingSchema = z.object({
  productVariantId: z.string().cuid(),
  marketplaceProductId: z.string().cuid(),
  syncEnabled: z.boolean().optional().default(true),
});

export type CreateMappingInput = z.infer<typeof createMappingSchema>;

export const listMappingsQuerySchema = z.object({
  marketplaceAccountId: z.string().cuid().optional(),
  mappingStatus: z.nativeEnum(MarketplaceMappingStatus).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
});

export type ListMappingsQuery = z.infer<typeof listMappingsQuerySchema>;

export const mappingIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const marketplaceAccountIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const productIdParamSchema = z.object({
  id: z.string().cuid(),
  productId: z.string().cuid(),
});
