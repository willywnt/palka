import { NextResponse } from 'next/server';

import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { variantRouteParamSchema } from '@/modules/catalog/validators';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string; variantId: string };

export const POST = withApiRoute<RouteParams>(
  async (_request, { user, params }) => {
    const parsedParams = variantRouteParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Variant not found');

    const variant = await catalogServerService.restoreVariant(
      user.id,
      parsedParams.data.id,
      parsedParams.data.variantId,
    );
    return apiSuccess(variant);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
