import { MarketplaceSyncJobStatus } from '@prisma/client';
import { z } from 'zod';

export const listSyncJobsQuerySchema = z.object({
  marketplaceAccountId: z.string().cuid().optional(),
  syncStatus: z.nativeEnum(MarketplaceSyncJobStatus).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
});

export type ListSyncJobsQuery = z.infer<typeof listSyncJobsQuerySchema>;

export const syncJobIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const disableMappingSyncSchema = z.object({
  mappingId: z.string().cuid(),
});

export type DisableMappingSyncInput = z.infer<typeof disableMappingSyncSchema>;
