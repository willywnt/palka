import { NextResponse } from 'next/server';

import { marketplaceImportJobService } from '@/modules/marketplace/services/marketplace-import-job.service';
import { marketplaceConnectionIdSchema } from '@/modules/marketplace/validators/connection-id';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

/**
 * Latest catalog-import job for a connection (or null). The import UI polls this while a job is
 * PENDING/PROCESSING and reads it once on mount so a refresh / revisit reconnects to a running
 * import instead of losing it. Read scope (marketplace.view); starting one needs marketplace.manage.
 */
export const GET = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Marketplace connection not found');

    const job = await marketplaceImportJobService.getLatestJob(org.id, parsed.data.id);
    return apiSuccess(job);
  },
  { requireAuth: true, requirePermission: 'marketplace.view' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
