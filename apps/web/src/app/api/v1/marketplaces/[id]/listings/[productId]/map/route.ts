import { NextResponse } from 'next/server';

import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import {
  mapListingSchema,
  marketplaceListingParamSchema,
} from '@/modules/marketplace/validators/map-listing';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string; productId: string };

export const POST = withApiRoute<RouteParams>(
  async (request, { user, org, params }) => {
    const parsedParams = marketplaceListingParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Listing not found');

    const body: unknown = await request.json();
    const parsed = mapListingSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const listing = await marketplaceMappingService.mapListing(
      org.id,
      user.id,
      parsedParams.data.id,
      parsedParams.data.productId,
      parsed.data.variantId,
    );
    return apiSuccess(listing);
  },
  { requireAuth: true, requirePermission: 'marketplace.manage' },
);

export const DELETE = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = marketplaceListingParamSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Listing not found');

    const listing = await marketplaceMappingService.unmapListing(
      org.id,
      parsed.data.id,
      parsed.data.productId,
    );
    return apiSuccess(listing);
  },
  { requireAuth: true, requirePermission: 'marketplace.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
