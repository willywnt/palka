import { NextResponse } from 'next/server';

import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import {
  addVariantsSchema,
  deleteVariantsSchema,
  productIdParamSchema,
} from '@/modules/catalog/validators';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const POST = withApiRoute<RouteParams>(
  async (request, { user, org, params }) => {
    const parsedParams = productIdParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Product not found');

    const body: unknown = await request.json();
    const parsed = addVariantsSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const variants = await catalogServerService.addVariants(
      org.id,
      user.id,
      parsedParams.data.id,
      parsed.data.variants,
    );
    return apiSuccess(variants, 201);
  },
  { requireAuth: true },
);

export const DELETE = withApiRoute<RouteParams>(
  async (request, { user, org, params }) => {
    const parsedParams = productIdParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Product not found');

    const body: unknown = await request.json();
    const parsed = deleteVariantsSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    await catalogServerService.deleteVariants(
      org.id,
      user.id,
      parsedParams.data.id,
      parsed.data.variantIds,
    );
    return apiSuccess({ ok: true });
  },
  { requireAuth: true, requirePermission: 'catalog.delete' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
