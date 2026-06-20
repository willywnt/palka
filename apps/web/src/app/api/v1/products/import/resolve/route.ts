import { NextResponse } from 'next/server';

import { productImportService } from '@/modules/catalog/services/product-import.service';
import { resolveImportSchema } from '@/modules/catalog/validators';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const POST = withApiRoute(
  async (request, { org }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = resolveImportSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const context = await productImportService.resolveContext(
      org.id,
      parsed.data.skus,
      parsed.data.names,
    );

    return apiSuccess(context);
  },
  { requireAuth: true, requirePermission: 'catalog.import' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
