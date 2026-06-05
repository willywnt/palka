import { NextResponse } from 'next/server';

import { purchasingServerService } from '@/modules/purchasing/services/purchasing-server.service';
import { resolveVariantQuerySchema } from '@/modules/purchasing/validators/resolve-variant';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { user }) => {
    const parsed = resolveVariantQuerySchema.safeParse({
      code: new URL(request.url).searchParams.get('code') ?? '',
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const variant = await purchasingServerService.resolvePurchasableVariant(
      user.id,
      parsed.data.code,
    );
    return apiSuccess(variant);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
