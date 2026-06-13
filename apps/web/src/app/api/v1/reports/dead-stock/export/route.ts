import { NextResponse } from 'next/server';

import { reportingServerService } from '@/modules/reporting/services/reporting-server.service';
import { deadStockToCsv } from '@/modules/reporting/utils/dead-stock-csv';
import { parseDeadStockQuery } from '@/modules/reporting/validators';
import { apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { org }) => {
    const parsed = parseDeadStockQuery(new URL(request.url).searchParams);
    if (!parsed.success) return apiValidationError(parsed.error);

    const report = await reportingServerService.getDeadStock(org.id, parsed.data);
    const csv = deadStockToCsv(report.rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="dead-stock.csv"',
      },
    });
  },
  { requireAuth: true, requirePermission: 'reports.view' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
