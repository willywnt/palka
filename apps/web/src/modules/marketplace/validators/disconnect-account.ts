import { z } from 'zod';

export const disconnectMarketplaceAccountSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export type DisconnectMarketplaceAccountInput = z.infer<typeof disconnectMarketplaceAccountSchema>;
