import { NextResponse } from 'next/server';

import { salesServerService } from '@/modules/sales/services/sales-server.service';
import { saleIdSchema } from '@/modules/sales/validators/sale-id';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const POST = withApiRoute<RouteParams>(
  async (_request, { user, org, params }) => {
    const parsed = saleIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Sale not found');

    const sale = await salesServerService.voidSale(org.id, user.id, parsed.data.id);
    return apiSuccess(sale);
  },
  { requireAuth: true, requirePermission: 'sales.refund' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
