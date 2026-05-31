import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceProductImportService } from '@/modules/marketplace/services/marketplace-product-import.service';
import {
  importMarketplaceProductsSchema,
  marketplaceAccountIdParamSchema,
} from '@/modules/marketplace/validators/mapping';
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError,
} from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const params = await context.params;
    const idParsed = marketplaceAccountIdParamSchema.safeParse(params);
    if (!idParsed.success) return apiValidationError(idParsed.error);

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = importMarketplaceProductsSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await marketplaceProductImportService.importProducts(user.id, idParsed.data.id, {
      dryRun: parsed.data.dryRun,
    });

    return apiSuccess(result, 201);
  } catch (error) {
    if (error instanceof MarketplaceError) {
      return apiError({ code: error.code, message: error.operatorMessage }, error.statusCode);
    }
    return handleApiError(error);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
