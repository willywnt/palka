import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceSyncService } from '@/modules/marketplace/services/marketplace-sync.service';
import { syncJobIdParamSchema } from '@/modules/marketplace/validators/sync';
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError,
} from '@/lib/api-response';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const params = await context.params;
    const parsed = syncJobIdParamSchema.safeParse(params);
    if (!parsed.success) return apiValidationError(parsed.error);

    const job = await marketplaceSyncService.getJobDetail(user.id, parsed.data.id);

    return apiSuccess(job);
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
