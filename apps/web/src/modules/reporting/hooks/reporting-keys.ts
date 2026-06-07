/** Query-key hierarchy for the reporting domain. `all` invalidates everything. */
export const reportingKeys = {
  all: ['reporting'] as const,
  profit: (params: Record<string, string>) => ['reporting', 'profit', params] as const,
  channels: (params: Record<string, string>) => ['reporting', 'channels', params] as const,
  inventoryValue: ['reporting', 'inventory-value'] as const,
};
