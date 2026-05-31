import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import {
  createMappingSchema,
  listMappingsQuerySchema,
} from '@/modules/marketplace/validators/mapping';
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError,
} from '@/lib/api-response';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const { searchParams } = new URL(request.url);
    const parsed = listMappingsQuerySchema.safeParse({
      marketplaceAccountId: searchParams.get('marketplaceAccountId') ?? undefined,
      mappingStatus: searchParams.get('mappingStatus') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
    });

    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await marketplaceMappingService.listMappings(user.id, parsed.data);

    return apiSuccess(result.items, 200, {
      total: result.total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
  } catch (error) {
    if (error instanceof MarketplaceError) {
      return apiError({ code: error.code, message: error.operatorMessage }, error.statusCode);
    }
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const body: unknown = await request.json();
    const parsed = createMappingSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const mapping = await marketplaceMappingService.createMapping(user.id, parsed.data);

    return apiSuccess(mapping, 201);
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
