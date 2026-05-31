import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceProvider } from '@prisma/client';
import { marketplaceOAuthService } from '@/modules/marketplace/services/marketplace-oauth.service';
import { apiSuccess, apiUnauthorized, handleApiError } from '@/lib/api-response';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const providers = Object.values(MarketplaceProvider).map((provider) =>
      marketplaceOAuthService.getProviderOAuthStatus(provider),
    );

    return apiSuccess(providers);
  } catch (error) {
    return handleApiError(error);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
