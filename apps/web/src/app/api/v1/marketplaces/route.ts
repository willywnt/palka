import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceAccountService } from '@/modules/marketplace/services/marketplace-account.service';
import { connectMarketplaceAccountSchema } from '@/modules/marketplace/validators/connect-account';
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError,
} from '@/lib/api-response';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const accounts = await marketplaceAccountService.listAccounts(user.id);
    return apiSuccess(accounts);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const body: unknown = await request.json();
    const parsed = connectMarketplaceAccountSchema.safeParse(body);

    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const account = await marketplaceAccountService.connectAccount(user.id, parsed.data);
    return apiSuccess(account, 201);
  } catch (error) {
    if (error instanceof MarketplaceError) {
      return apiError({ code: error.code, message: error.message }, error.statusCode);
    }

    return handleApiError(error);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
