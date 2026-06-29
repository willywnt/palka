import { NextResponse } from 'next/server';
import { z } from 'zod';

import { marketplaceImportJobService } from '@/modules/marketplace/services/marketplace-import-job.service';
import { marketplaceConnectionIdSchema } from '@/modules/marketplace/validators/connection-id';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

/** `full: true` re-pulls the whole catalog; otherwise (default) only listings changed since the
 *  connection's last complete import. Body is optional — an absent body means an incremental import. */
const importOptionsSchema = z.object({ full: z.boolean().optional().default(false) });

/**
 * Starts a catalog import. Lazada → enqueues a durable background job and returns it in a PENDING
 * state (the client polls GET /import-job); non-Lazada stubs import inline and return COMPLETED.
 */
export const POST = withApiRoute<RouteParams>(
  async (request, { user, org, params }) => {
    const parsed = marketplaceConnectionIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Marketplace connection not found');

    const body: unknown = await request.json().catch(() => ({}));
    const options = importOptionsSchema.safeParse(body ?? {});
    const full = options.success ? options.data.full : false;

    const job = await marketplaceImportJobService.startImport(
      org.id,
      user.id,
      parsed.data.id,
      full,
    );
    return apiSuccess(job);
  },
  { requireAuth: true, rateLimit: 'write', requirePermission: 'marketplace.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
