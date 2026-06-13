import { NextResponse } from 'next/server';

import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { adjustStockSchema, variantIdParamSchema } from '@/modules/inventory/validators';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { variantId: string };

export const POST = withApiRoute<RouteParams>(
  async (request, { user, org, params }) => {
    const parsedParams = variantIdParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Product variant not found');

    const body: unknown = await request.json();
    const parsed = adjustStockSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await inventoryServerService.adjustStock(
      org.id,
      user.id,
      parsedParams.data.variantId,
      parsed.data,
    );
    return apiSuccess(result);
  },
  { requireAuth: true, requirePermission: 'inventory.adjust' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
