import { NextResponse } from 'next/server';

import { salesServerService } from '@/modules/sales/services/sales-server.service';
import { searchVariantsQuerySchema } from '@/modules/sales/validators/search-variants';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { user }) => {
    const url = new URL(request.url);
    const parsed = searchVariantsQuerySchema.safeParse({
      q: url.searchParams.get('q') ?? '',
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await salesServerService.searchSellableVariants(user.id, parsed.data);
    return apiSuccess(result);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
