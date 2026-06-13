import { NextResponse } from 'next/server';

import { purchasingServerService } from '@/modules/purchasing/services/purchasing-server.service';
import { purchaseOrderIdSchema } from '@/modules/purchasing/validators/po-id';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const POST = withApiRoute<RouteParams>(
  async (_request, { user, org, params }) => {
    const parsed = purchaseOrderIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Purchase order not found');

    const order = await purchasingServerService.cancelPurchaseOrder(
      org.id,
      user.id,
      parsed.data.id,
    );
    return apiSuccess(order);
  },
  { requireAuth: true, requirePermission: 'purchasing.cancel' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
