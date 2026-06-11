import { NextResponse } from 'next/server';

import { ordersServerService } from '@/modules/orders/services/orders-server.service';
import { listOrdersQuerySchema } from '@/modules/orders/validators/list-orders';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { user }) => {
    const searchParams = new URL(request.url).searchParams;
    const parsed = listOrdersQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const orders = await ordersServerService.listOrders(user.id, parsed.data);
    return apiSuccess(orders);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
