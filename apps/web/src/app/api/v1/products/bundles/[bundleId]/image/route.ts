import { NextResponse } from 'next/server';
import { z } from 'zod';

import { bundleServerService } from '@/modules/catalog/services/bundle-server.service';
import { setVariantImageSchema } from '@/modules/catalog/validators';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

const paramsSchema = z.object({ bundleId: z.string().min(1) });

type RouteParams = { bundleId: string };

export const PATCH = withApiRoute<RouteParams>(
  async (request, { org, params }) => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Bundle not found');

    const body: unknown = await request.json();
    const parsed = setVariantImageSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const bundle = await bundleServerService.setBundleImage(
      org.id,
      parsedParams.data.bundleId,
      parsed.data,
    );
    return apiSuccess(bundle);
  },
  { requireAuth: true },
);

export const DELETE = withApiRoute<RouteParams>(
  async (_request, { org, params }) => {
    const parsed = paramsSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Bundle not found');

    const bundle = await bundleServerService.removeBundleImage(org.id, parsed.data.bundleId);
    return apiSuccess(bundle);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
