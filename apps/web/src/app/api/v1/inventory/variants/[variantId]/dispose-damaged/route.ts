import { NextResponse } from 'next/server';

import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { disposeDamagedSchema, variantIdParamSchema } from '@/modules/inventory/validators';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { variantId: string };

export const POST = withApiRoute<RouteParams>(
  async (request, { user, params }) => {
    const parsedParams = variantIdParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Product variant not found');

    const body: unknown = await request.json();
    const parsed = disposeDamagedSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await inventoryServerService.disposeDamaged(
      user.id,
      parsedParams.data.variantId,
      parsed.data.quantity,
      parsed.data.note,
    );
    return apiSuccess(result);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
