import { NextResponse } from 'next/server';

import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { productsToCsv } from '@/modules/catalog/utils/product-csv';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (_request, { org }) => {
    const rows = await catalogServerService.listForExport(org.id);
    const csv = productsToCsv(rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="produk.csv"',
      },
    });
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
