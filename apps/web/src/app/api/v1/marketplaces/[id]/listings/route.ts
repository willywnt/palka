import { NextResponse } from 'next/server';

import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import { marketplaceConnectionIdSchema } from '@/modules/marketplace/validators/connection-id';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const GET = withApiRoute<RouteParams>(
  async (_request, { user, params }) => {
    const parsed = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Marketplace connection not found');

    const listings = await marketplaceMappingService.listListings(user.id, parsed.data.id);
    return apiSuccess(listings);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
