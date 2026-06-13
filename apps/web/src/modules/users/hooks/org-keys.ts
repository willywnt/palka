/** Query keys for the org/team module — one hierarchy, invalidate by prefix. */
export const orgKeys = {
  all: ['org'] as const,
  summary: ['org', 'summary'] as const,
  members: ['org', 'members'] as const,
  invites: ['org', 'invites'] as const,
  permissions: ['org', 'permissions'] as const,
  audit: (page: number, pageSize: number) => ['org', 'audit', page, pageSize] as const,
};
