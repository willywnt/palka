import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import {
  listMarketplaceProductsQuerySchema,
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

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const params = await context.params;
    const idParsed = marketplaceAccountIdParamSchema.safeParse(params);
    if (!idParsed.success) return apiValidationError(idParsed.error);

    const { searchParams } = new URL(request.url);
    const queryParsed = listMarketplaceProductsQuerySchema.safeParse({
      search: searchParams.get('search') ?? undefined,
      unmappedOnly: searchParams.get('unmappedOnly') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    });

    if (!queryParsed.success) return apiValidationError(queryParsed.error);

    const result = await marketplaceMappingService.listProducts(user.id, idParsed.data.id, {
      search: queryParsed.data.search,
      unmappedOnly: queryParsed.data.unmappedOnly,
      page: queryParsed.data.page,
      pageSize: queryParsed.data.pageSize,
    });

    return apiSuccess(result.items, 200, {
      total: result.total,
      page: queryParsed.data.page,
      pageSize: queryParsed.data.pageSize,
    });
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
