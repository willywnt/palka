import { NextResponse } from 'next/server';
import { z } from 'zod';

import { bundleServerService } from '@/modules/catalog/services/bundle-server.service';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

const paramsSchema = z.object({ bundleId: z.string().min(1) });

type RouteParams = { bundleId: string };

export const POST = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Bundle not found');

    const restored = await bundleServerService.restoreBundle(org.id, parsed.data.bundleId);
    return apiSuccess(restored);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
