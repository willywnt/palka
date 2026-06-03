import { NextResponse } from 'next/server';

import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import {
  marketplaceListingParamSchema,
  toggleSyncSchema,
} from '@/modules/marketplace/validators/map-listing';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string; productId: string };

export const PATCH = withApiRoute<RouteParams>(
  async (request, { user, params }) => {
    const parsedParams = marketplaceListingParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Listing not found');

    const body: unknown = await request.json();
    const parsed = toggleSyncSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const listing = await marketplaceMappingService.setSyncEnabled(
      user.id,
      parsedParams.data.id,
      parsedParams.data.productId,
      parsed.data.syncEnabled,
    );
    return apiSuccess(listing);
  },
  { requireAuth: true },
);

export const POST = withApiRoute<RouteParams>(
  async (_request, { user, params }) => {
    const parsed = marketplaceListingParamSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Listing not found');

    const listing = await marketplaceMappingService.syncNow(
      user.id,
      parsed.data.id,
      parsed.data.productId,
    );
    return apiSuccess(listing);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
