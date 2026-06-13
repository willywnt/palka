import { z } from 'zod';

/** Invitable roles — you never invite a second OWNER (ownership is the creator's). */
export const createInviteSchema = z.object({
  role: z.enum(['ADMIN', 'STAFF']),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/** Role changes are limited to the non-owner tiers (OWNER is immutable via the UI). */
export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'STAFF']),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
