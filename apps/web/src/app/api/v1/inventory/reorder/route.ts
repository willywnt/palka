import { NextResponse } from 'next/server';

import { inventoryReorderService } from '@/modules/inventory/services/inventory-reorder.service';
import { reorderReportQuerySchema } from '@/modules/inventory/validators';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { user }) => {
    const url = new URL(request.url);
    const parsed = reorderReportQuerySchema.safeParse({
      windowDays: url.searchParams.get('windowDays') ?? undefined,
      leadTimeDays: url.searchParams.get('leadTimeDays') ?? undefined,
      targetCoverDays: url.searchParams.get('targetCoverDays') ?? undefined,
    });

    if (!parsed.success) return apiValidationError(parsed.error);

    const report = await inventoryReorderService.getReorderReport(user.id, parsed.data);
    return apiSuccess(report);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
