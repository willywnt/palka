import { NextResponse } from 'next/server';

import { marketplaceServerService } from '@/modules/marketplace/services/marketplace-server.service';
import { createMarketplaceConnectionSchema } from '@/modules/marketplace/validators/create-connection';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (_request, { org }) => {
    const connections = await marketplaceServerService.listConnections(org.id);
    return apiSuccess(connections);
  },
  { requireAuth: true },
);

export const POST = withApiRoute(
  async (request, { user, org }) => {
    const body: unknown = await request.json();
    const parsed = createMarketplaceConnectionSchema.safeParse(body);

    if (!parsed.success) return apiValidationError(parsed.error);

    const connection = await marketplaceServerService.createConnection(
      org.id,
      user.id,
      parsed.data,
    );
    return apiSuccess(connection, 201);
  },
  { requireAuth: true, requirePermission: 'marketplace.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
