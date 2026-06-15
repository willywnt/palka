import { NextResponse } from 'next/server';

import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import { marketplaceConnectionIdSchema } from '@/modules/marketplace/validators/connection-id';
import { listListingsQuerySchema } from '@/modules/marketplace/validators/list-listings';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const GET = withApiRoute<RouteParams>(
  async (request, { org, params }) => {
    const parsedParams = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Marketplace connection not found');

    const searchParams = new URL(request.url).searchParams;
    const parsedQuery = listListingsQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });
    if (!parsedQuery.success) return apiValidationError(parsedQuery.error);

    const listings = await marketplaceMappingService.listListings(
      org.id,
      parsedParams.data.id,
      parsedQuery.data,
    );
    return apiSuccess(listings);
  },
  { requireAuth: true, requirePermission: 'marketplace.view' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
