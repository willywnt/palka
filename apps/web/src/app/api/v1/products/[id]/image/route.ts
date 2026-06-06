import { NextResponse } from 'next/server';

import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { productIdParamSchema, setProductImageSchema } from '@/modules/catalog/validators';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const PATCH = withApiRoute<RouteParams>(
  async (request, { user, params }) => {
    const parsedParams = productIdParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Product not found');

    const body: unknown = await request.json();
    const parsed = setProductImageSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const product = await catalogServerService.setProductImage(
      user.id,
      parsedParams.data.id,
      parsed.data,
    );
    return apiSuccess(product);
  },
  { requireAuth: true },
);

export const DELETE = withApiRoute<RouteParams>(
  async (_request, { user, params }) => {
    const parsedParams = productIdParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Product not found');

    const product = await catalogServerService.removeProductImage(user.id, parsedParams.data.id);
    return apiSuccess(product);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
