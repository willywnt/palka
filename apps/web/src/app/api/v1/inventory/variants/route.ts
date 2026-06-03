import { NextResponse } from 'next/server';

import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { listStockOverviewQuerySchema } from '@/modules/inventory/validators';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { user }) => {
    const url = new URL(request.url);
    const parsed = listStockOverviewQuerySchema.safeParse({
      search: url.searchParams.get('search') ?? undefined,
      lowStockOnly: url.searchParams.get('lowStockOnly') ?? undefined,
    });

    if (!parsed.success) return apiValidationError(parsed.error);

    const items = await inventoryServerService.listStockOverview(user.id, parsed.data);
    return apiSuccess(items);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
