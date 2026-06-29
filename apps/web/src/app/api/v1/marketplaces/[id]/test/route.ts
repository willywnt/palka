import { NextResponse } from 'next/server';

import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { getConnectionOAuthService } from '@/modules/marketplace/services/connection-oauth';
import { marketplaceServerService } from '@/modules/marketplace/services/marketplace-server.service';
import { marketplaceConnectionIdSchema } from '@/modules/marketplace/validators/connection-id';

type RouteParams = { id: string };

export const POST = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Marketplace connection not found');

    const connection = await marketplaceServerService.getConnectionById(org.id, parsed.data.id);
    const service = getConnectionOAuthService(connection.provider);
    if (!service) {
      return apiSuccess({ ready: false, reason: 'Tes koneksi belum didukung untuk provider ini.' });
    }

    const result = await service.testConnection(org.id, parsed.data.id);
    return apiSuccess(result);
  },
  { requireAuth: true, rateLimit: 'write', requirePermission: 'marketplace.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
