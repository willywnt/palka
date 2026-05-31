import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceSyncService } from '@/modules/marketplace/services/marketplace-sync.service';
import { listSyncJobsQuerySchema } from '@/modules/marketplace/validators/sync';
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

    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = listSyncJobsQuerySchema.safeParse(params);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await marketplaceSyncService.listJobs(user.id, parsed.data);

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

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
