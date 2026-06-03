import { NextResponse } from 'next/server';

import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { updateVariantSchema, variantRouteParamSchema } from '@/modules/catalog/validators';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string; variantId: string };

export const PATCH = withApiRoute<RouteParams>(
  async (request, { user, params }) => {
    const parsedParams = variantRouteParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Variant not found');

    const body: unknown = await request.json();
    const parsed = updateVariantSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const variant = await catalogServerService.updateVariant(
      user.id,
      parsedParams.data.id,
      parsedParams.data.variantId,
      parsed.data,
    );
    return apiSuccess(variant);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
