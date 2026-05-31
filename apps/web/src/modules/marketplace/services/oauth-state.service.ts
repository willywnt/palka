import 'server-only';

import type { MarketplaceProvider } from '@prisma/client';

import type { OAuthFlowMode } from '../domain/oauth.types';
import { createSignedOAuthState, verifySignedOAuthState } from '../utils/oauth-state-token';

export type OAuthStateContext = {
  userId: string;
  provider: MarketplaceProvider;
  mode: OAuthFlowMode;
  returnUrl: string;
  accountId?: string;
};

export class MarketplaceOAuthStateService {
  createState(context: OAuthStateContext): string {
    return createSignedOAuthState({
      userId: context.userId,
      provider: context.provider,
      mode: context.mode,
      returnUrl: context.returnUrl,
      accountId: context.accountId,
    });
  }

  consumeState(state: string): OAuthStateContext | null {
    const payload = verifySignedOAuthState(state);

    if (!payload) return null;

    return {
      userId: payload.sub,
      provider: payload.provider,
      mode: payload.mode,
      returnUrl: payload.returnUrl,
      accountId: payload.accountId,
    };
  }
}

export const marketplaceOAuthStateService = new MarketplaceOAuthStateService();
