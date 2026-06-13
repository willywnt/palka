import { NextResponse } from 'next/server';

import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { productIdParamSchema, updateProductSchema } from '@/modules/catalog/validators';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const GET = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = productIdParamSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Product not found');

    const product = await catalogServerService.getProductById(org.id, parsed.data.id);
    return apiSuccess(product);
  },
  { requireAuth: true },
);

export const PATCH = withApiRoute<RouteParams>(
  async (request, { org, params }) => {
    const parsedParams = productIdParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Product not found');

    const body: unknown = await request.json();
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const product = await catalogServerService.updateProduct(
      org.id,
      parsedParams.data.id,
      parsed.data,
    );
    return apiSuccess(product);
  },
  { requireAuth: true },
);

export const DELETE = withApiRoute<RouteParams>(
  async (_request, { user, org, params }) => {
    const parsed = productIdParamSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Product not found');

    await catalogServerService.deleteProduct(org.id, user.id, parsed.data.id);
    return apiSuccess({ id: parsed.data.id });
  },
  { requireAuth: true, requirePermission: 'catalog.delete' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
