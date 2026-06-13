import { API_BASE_PATH } from '@falka/config/constants';

export const apiRoutes = {
  health: `${API_BASE_PATH}/health`,
  uploadsPresign: `${API_BASE_PATH}/uploads/presign`,
  uploadsPresignImage: `${API_BASE_PATH}/uploads/presign-image`,
  recordings: `${API_BASE_PATH}/recordings`,
  products: `${API_BASE_PATH}/products`,
  bundles: `${API_BASE_PATH}/products/bundles`,
  inventory: `${API_BASE_PATH}/inventory`,
  orders: `${API_BASE_PATH}/orders`,
  returns: `${API_BASE_PATH}/returns`,
  sales: `${API_BASE_PATH}/sales`,
  purchaseOrders: `${API_BASE_PATH}/purchase-orders`,
  reports: `${API_BASE_PATH}/reports`,
  scannerPairing: `${API_BASE_PATH}/scanner-pairing`,
  marketplace: `${API_BASE_PATH}/marketplaces`,
  storage: `${API_BASE_PATH}/storage`,
  org: `${API_BASE_PATH}/org`,
  orgPermissions: `${API_BASE_PATH}/org/permissions`,
  audit: `${API_BASE_PATH}/audit`,
  adminOps: `${API_BASE_PATH}/admin/ops`,
  adminOrganizations: `${API_BASE_PATH}/admin/organizations`,
} as const;

export type ApiRouteKey = keyof typeof apiRoutes;

export function getApiUrl(path: string): string {
  if (path.startsWith('http')) return path;

  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
