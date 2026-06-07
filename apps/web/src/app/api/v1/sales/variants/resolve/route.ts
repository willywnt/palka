import { NextResponse } from 'next/server';

import { salesServerService } from '@/modules/sales/services/sales-server.service';
import { resolveVariantQuerySchema } from '@/modules/sales/validators/resolve-variant';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { user }) => {
    const parsed = resolveVariantQuerySchema.safeParse({
      code: new URL(request.url).searchParams.get('code') ?? '',
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await salesServerService.resolveScannedItem(user.id, parsed.data.code);
    return apiSuccess(result);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
