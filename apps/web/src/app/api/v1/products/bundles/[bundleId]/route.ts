import { NextResponse } from 'next/server';
import { z } from 'zod';

import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { updateBundleSchema } from '@/modules/catalog/validators';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

const paramsSchema = z.object({ bundleId: z.string().min(1) });

type RouteParams = { bundleId: string };

export const GET = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Bundle not found');

    const bundle = await catalogServerService.getBundle(org.id, parsed.data.bundleId);
    return apiSuccess(bundle);
  },
  { requireAuth: true },
);

export const PATCH = withApiRoute<RouteParams>(
  async (request, { org, params }) => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Bundle not found');

    const body: unknown = await request.json();
    const parsed = updateBundleSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const bundle = await catalogServerService.updateBundle(
      org.id,
      parsedParams.data.bundleId,
      parsed.data,
    );
    return apiSuccess(bundle);
  },
  { requireAuth: true },
);

export const DELETE = withApiRoute<RouteParams>(
  async (_request, { user, org, params }) => {
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Bundle not found');

    await catalogServerService.deleteBundle(org.id, user.id, parsed.data.bundleId);
    return apiSuccess({ id: parsed.data.bundleId });
  },
  { requireAuth: true, requirePermission: 'catalog.delete' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
