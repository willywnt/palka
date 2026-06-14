import { NextResponse } from 'next/server';

import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { marketplaceHealthService } from '@/modules/marketplace/services/marketplace-health.service';
import { marketplaceConnectionIdSchema } from '@/modules/marketplace/validators/connection-id';

type RouteParams = { id: string };

export const GET = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Marketplace connection not found');

    const health = await marketplaceHealthService.getHealth(org.id, parsed.data.id);
    return apiSuccess(health);
  },
  { requireAuth: true, requirePermission: 'marketplace.view' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
