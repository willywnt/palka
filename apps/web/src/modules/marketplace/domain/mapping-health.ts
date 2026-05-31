import type { MarketplaceMappingStatus } from '@prisma/client';

export type MappingHealthIssue =
  | 'missing_marketplace_product'
  | 'deleted_variant'
  | 'sync_disabled'
  | 'broken_mapping'
  | 'conflict'
  | 'not_sync_ready';

export type MappingHealth = {
  status: MarketplaceMappingStatus;
  issues: MappingHealthIssue[];
  syncReady: boolean;
};

export function resolveMappingHealth(input: {
  mappingStatus: MarketplaceMappingStatus;
  syncEnabled: boolean;
  productDeleted: boolean;
  variantDeleted: boolean;
}): MappingHealth {
  const issues: MappingHealthIssue[] = [];

  if (input.productDeleted) issues.push('missing_marketplace_product');
  if (input.variantDeleted) issues.push('deleted_variant');
  if (!input.syncEnabled) issues.push('sync_disabled');
  if (input.mappingStatus === 'BROKEN') issues.push('broken_mapping');
  if (input.mappingStatus === 'CONFLICT') issues.push('conflict');

  const syncReady =
    input.mappingStatus === 'MAPPED' &&
    input.syncEnabled &&
    !input.productDeleted &&
    !input.variantDeleted;

  if (!syncReady && issues.length === 0) {
    issues.push('not_sync_ready');
  }

  return {
    status: input.mappingStatus,
    issues,
    syncReady,
  };
}
