import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { marketplaceSyncService } from '@/modules/marketplace/services/marketplace-sync.service';
import { apiSuccess, apiUnauthorized, handleApiError } from '@/lib/api-response';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const overview = await marketplaceSyncService.getOverview(user.id);

    return apiSuccess(overview);
  } catch (error) {
    return handleApiError(error);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
