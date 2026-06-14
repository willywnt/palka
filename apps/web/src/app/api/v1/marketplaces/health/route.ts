import { NextResponse } from 'next/server';

import { apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { marketplaceHealthService } from '@/modules/marketplace/services/marketplace-health.service';

export const GET = withApiRoute(
  async (_request, { org }) => {
    const health = await marketplaceHealthService.listHealth(org.id);
    return apiSuccess(health);
  },
  { requireAuth: true, requirePermission: 'marketplace.view' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
