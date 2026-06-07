import { NextResponse } from 'next/server';
import { z } from 'zod';

import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

const querySchema = z.object({ variantIds: z.string().trim().min(1) });

/** Cap ids per call — matches the largest stock-table page size. */
const MAX_IDS = 200;

/**
 * Buildable count keyed by variant id, for the bundles among the given ids (others
 * absent → not a bundle). Lets stock tables (inventory) overlay a bundle badge +
 * buildable without the inventory module importing catalog (avoids an import cycle).
 */
export const GET = withApiRoute(
  async (request, { user }) => {
    const parsed = querySchema.safeParse({
      variantIds: new URL(request.url).searchParams.get('variantIds') ?? '',
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const ids = parsed.data.variantIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, MAX_IDS);
    const data = await catalogServerService.getBundleBuildable(user.id, ids);
    return apiSuccess(data);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
