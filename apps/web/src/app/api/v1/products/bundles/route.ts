import { NextResponse } from 'next/server';

import { bundleServerService } from '@/modules/catalog/services/bundle-server.service';
import { createBundleSchema, listBundlesQuerySchema } from '@/modules/catalog/validators';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { org }) => {
    const url = new URL(request.url);
    const parsed = listBundlesQuerySchema.safeParse({
      q: url.searchParams.get('q') ?? '',
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await bundleServerService.listBundles(org.id, parsed.data);
    return apiSuccess(result);
  },
  { requireAuth: true },
);

export const POST = withApiRoute(
  async (request, { user, org }) => {
    const body: unknown = await request.json();
    const parsed = createBundleSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await bundleServerService.createBundle(org.id, user.id, parsed.data);
    return apiSuccess(result);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
