import { NextResponse } from 'next/server';

import { reportingServerService } from '@/modules/reporting/services/reporting-server.service';
import { parseDeadStockQuery } from '@/modules/reporting/validators';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { org }) => {
    const parsed = parseDeadStockQuery(new URL(request.url).searchParams);
    if (!parsed.success) return apiValidationError(parsed.error);

    const report = await reportingServerService.getDeadStock(org.id, parsed.data);
    return apiSuccess(report);
  },
  { requireAuth: true, requirePermission: 'reports.view' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
