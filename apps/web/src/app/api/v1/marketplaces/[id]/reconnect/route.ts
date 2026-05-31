import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceAccountService } from '@/modules/marketplace/services/marketplace-account.service';
import { marketplaceAccountIdSchema } from '@/modules/marketplace/validators/account-id';
import { reconnectMarketplaceAccountSchema } from '@/modules/marketplace/validators/reconnect-account';
import {
  apiError,
  apiNotFound,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError,
} from '@/lib/api-response';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const params = await context.params;
    const idParsed = marketplaceAccountIdSchema.safeParse(params);

    if (!idParsed.success) {
      return apiNotFound('Marketplace account not found');
    }

    const body: unknown = await request.json();
    const parsed = reconnectMarketplaceAccountSchema.safeParse(body);

    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const account = await marketplaceAccountService.reconnectAccount(
      user.id,
      idParsed.data.id,
      parsed.data,
    );

    return apiSuccess(account);
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
