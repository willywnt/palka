import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceSyncService } from '@/modules/marketplace/services/marketplace-sync.service';
import { disableMappingSyncSchema } from '@/modules/marketplace/validators/sync';
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError,
} from '@/lib/api-response';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const body: unknown = await request.json();
    const parsed = disableMappingSyncSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await marketplaceSyncService.disableMappingSync(user.id, parsed.data.mappingId);

    return apiSuccess(result);
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
