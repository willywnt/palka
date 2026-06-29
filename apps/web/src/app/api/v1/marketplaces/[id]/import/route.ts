import { NextResponse } from 'next/server';

import { marketplaceImportService } from '@/modules/marketplace/services/marketplace-import.service';
import { marketplaceConnectionIdSchema } from '@/modules/marketplace/validators/connection-id';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const POST = withApiRoute<RouteParams>(
  async (_request, { user, org, params }) => {
    const parsed = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Marketplace connection not found');

    const result = await marketplaceImportService.importListings(org.id, user.id, parsed.data.id);
    return apiSuccess(result);
  },
  { requireAuth: true, rateLimit: 'write', requirePermission: 'marketplace.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
