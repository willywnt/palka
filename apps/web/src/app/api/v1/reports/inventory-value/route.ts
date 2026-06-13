import { NextResponse } from 'next/server';

import { reportingServerService } from '@/modules/reporting/services/reporting-server.service';
import { apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (_request, { org }) => {
    const report = await reportingServerService.getInventoryValuation(org.id);
    return apiSuccess(report);
  },
  { requireAuth: true, requirePermission: 'reports.view' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
