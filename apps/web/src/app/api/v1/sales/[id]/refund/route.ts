import { NextResponse } from 'next/server';

import { salesServerService } from '@/modules/sales/services/sales-server.service';
import { saleIdSchema } from '@/modules/sales/validators/sale-id';
import { refundSaleSchema } from '@/modules/sales/validators/refund-sale';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const POST = withApiRoute<RouteParams>(
  async (request, { user, org, params }) => {
    const parsedId = saleIdSchema.safeParse(await params);
    if (!parsedId.success) return apiNotFound('Sale not found');

    const parsed = refundSaleSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const sale = await salesServerService.createSaleRefund(
      org.id,
      user.id,
      parsedId.data.id,
      parsed.data,
    );
    return apiSuccess(sale);
  },
  { requireAuth: true, requirePermission: 'sales.refund' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
