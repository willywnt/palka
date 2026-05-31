import { NextResponse } from 'next/server';

import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceOAuthService } from '@/modules/marketplace/services/marketplace-oauth.service';
import {
  oauthCallbackQuerySchema,
  oauthProviderParamSchema,
} from '@/modules/marketplace/validators/oauth-callback';
import { buildOAuthRedirectUrl } from '@/modules/marketplace/utils/oauth-redirect';
import { apiError, apiValidationError, handleApiError } from '@/lib/api-response';
import { appLogger } from '@/lib/logger';

type RouteContext = {
  params: Promise<{ provider: string }>;
};

function redirectWithError(returnUrl: string, message: string) {
  const target = buildOAuthRedirectUrl(returnUrl, {
    oauth: 'error',
    message,
  });

  return NextResponse.redirect(target);
}

export async function GET(request: Request, context: RouteContext) {
  const fallbackReturnUrl = '/dashboard/marketplace';

  try {
    const params = await context.params;
    const providerParsed = oauthProviderParamSchema.safeParse(params);

    if (!providerParsed.success) {
      return apiValidationError(providerParsed.error);
    }

    const { provider } = providerParsed.data;
    const { searchParams } = new URL(request.url);

    const queryParsed = oauthCallbackQuerySchema.safeParse({
      code: searchParams.get('code') ?? undefined,
      state: searchParams.get('state') ?? undefined,
      error: searchParams.get('error') ?? undefined,
      error_description: searchParams.get('error_description') ?? undefined,
    });

    if (!queryParsed.success) {
      return apiValidationError(queryParsed.error);
    }

    const { code, state, error, error_description: errorDescription } = queryParsed.data;

    if (error) {
      appLogger.warn('marketplace.oauth.callback_error', {
        provider,
        error,
        errorDescription,
      });

      return redirectWithError(fallbackReturnUrl, errorDescription ?? error);
    }

    if (!state || !code) {
      throw MarketplaceError.invalidOAuthState();
    }

    const result = await marketplaceOAuthService.completeOAuthCallback({
      provider,
      authorizationCode: code,
      state,
    });

    const target = buildOAuthRedirectUrl(result.returnUrl, {
      oauth: result.status,
      provider,
      accountId: result.accountId,
      store: result.storeName,
    });

    return NextResponse.redirect(target);
  } catch (error) {
    if (error instanceof MarketplaceError) {
      appLogger.warn('marketplace.oauth.callback_failed', {
        code: error.code,
        message: error.message,
      });

      return redirectWithError(fallbackReturnUrl, error.operatorMessage);
    }

    return handleApiError(error);
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
