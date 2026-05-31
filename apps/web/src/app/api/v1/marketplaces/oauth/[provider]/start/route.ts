import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/modules/auth/services/session';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { marketplaceOAuthService } from '@/modules/marketplace/services/marketplace-oauth.service';
import { isSupportedMarketplaceProvider } from '@/modules/marketplace/services/provider.registry';
import {
  oauthProviderParamSchema,
  oauthStartQuerySchema,
} from '@/modules/marketplace/validators/oauth-callback';
import {
  apiError,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError,
} from '@/lib/api-response';
import { buildOAuthRedirectUrl } from '@/modules/marketplace/utils/oauth-redirect';

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiUnauthorized();

    const params = await context.params;
    const providerParsed = oauthProviderParamSchema.safeParse(params);

    if (!providerParsed.success) {
      return apiValidationError(providerParsed.error);
    }

    const { provider } = providerParsed.data;

    if (!isSupportedMarketplaceProvider(provider)) {
      throw MarketplaceError.invalidProvider();
    }

    const { searchParams } = new URL(request.url);
    const queryParsed = oauthStartQuerySchema.safeParse({
      returnUrl: searchParams.get('returnUrl') ?? undefined,
      redirect: searchParams.get('redirect') ?? undefined,
      accountId: searchParams.get('accountId') ?? undefined,
    });

    if (!queryParsed.success) {
      return apiValidationError(queryParsed.error);
    }

    const result = await marketplaceOAuthService.startOAuthFlow({
      userId: user.id,
      provider,
      returnUrl: queryParsed.data.returnUrl,
      accountId: queryParsed.data.accountId,
    });

    if (queryParsed.data.redirect && result.authorizationUrl) {
      return NextResponse.redirect(result.authorizationUrl);
    }

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
