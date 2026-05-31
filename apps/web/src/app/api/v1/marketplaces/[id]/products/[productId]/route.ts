import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import { productIdParamSchema } from '@/modules/marketplace/validators/mapping';
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError,
} from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string; productId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const params = await context.params;
    const parsed = productIdParamSchema.safeParse(params);
    if (!parsed.success) return apiValidationError(parsed.error);

    const product = await marketplaceMappingService.getProductDetail(
      user.id,
      parsed.data.id,
      parsed.data.productId,
    );

    return apiSuccess(product);
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
