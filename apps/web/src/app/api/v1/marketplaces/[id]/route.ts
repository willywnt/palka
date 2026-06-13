import { NextResponse } from 'next/server';

import { marketplaceServerService } from '@/modules/marketplace/services/marketplace-server.service';
import { marketplaceConnectionIdSchema } from '@/modules/marketplace/validators/connection-id';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const GET = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Marketplace connection not found');

    const connection = await marketplaceServerService.getConnectionById(org.id, parsed.data.id);
    return apiSuccess(connection);
  },
  { requireAuth: true },
);

export const DELETE = withApiRoute<RouteParams>(
  async (_request, { user, org, params }) => {
    const parsed = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Marketplace connection not found');

    const connection = await marketplaceServerService.disconnectConnection(
      org.id,
      user.id,
      parsed.data.id,
    );
    return apiSuccess(connection);
  },
  { requireAuth: true, requirePermission: 'marketplace.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
