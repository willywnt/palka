import { API_BASE_PATH } from '@olshop/config/constants';

export const apiRoutes = {
  health: `${API_BASE_PATH}/health`,
  uploadsPresign: `${API_BASE_PATH}/uploads/presign`,
  recordings: `${API_BASE_PATH}/recordings`,
  marketplace: `${API_BASE_PATH}/marketplaces`,
  marketplaceMappings: `${API_BASE_PATH}/marketplaces/mappings`,
  marketplaceSyncJobs: `${API_BASE_PATH}/marketplaces/sync/jobs`,
  marketplaceSyncOverview: `${API_BASE_PATH}/marketplaces/sync/overview`,
  marketplaceSyncDisable: `${API_BASE_PATH}/marketplaces/sync/mappings/disable`,
  marketplaceOAuthStatus: `${API_BASE_PATH}/marketplaces/oauth/status`,
  inventory: `${API_BASE_PATH}/inventory`,
  inventoryOverview: `${API_BASE_PATH}/inventory/overview`,
  inventoryProducts: `${API_BASE_PATH}/inventory/products`,
  inventoryVariants: `${API_BASE_PATH}/inventory/variants`,
  inventoryRecentMutations: `${API_BASE_PATH}/inventory/mutations/recent`,
  users: `${API_BASE_PATH}/users`,
  auditLogs: `${API_BASE_PATH}/audit-logs`,
  storage: `${API_BASE_PATH}/storage`,
} as const;

export type ApiRouteKey = keyof typeof apiRoutes;

export function getApiUrl(path: string): string {
  if (path.startsWith('http')) return path;

  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
