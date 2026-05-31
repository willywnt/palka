import type { MarketplaceProvider } from '@prisma/client';

export const OAUTH_FLOW_MODES = ['connect', 'reconnect'] as const;

export type OAuthFlowMode = (typeof OAUTH_FLOW_MODES)[number];

export type OAuthStatePayload = {
  v: 1;
  sub: string;
  provider: MarketplaceProvider;
  mode: OAuthFlowMode;
  accountId?: string;
  returnUrl: string;
  exp: number;
  nonce: string;
};

export type OAuthStartResult = {
  provider: MarketplaceProvider;
  state: string;
  authorizationUrl: string;
  mode: OAuthFlowMode;
};

export type OAuthCallbackResult = {
  provider: MarketplaceProvider;
  mode: OAuthFlowMode;
  accountId: string;
  storeName: string;
  returnUrl: string;
  status: 'connected' | 'reconnected';
};

export type TokenExchangeInput = {
  userId: string;
  provider: MarketplaceProvider;
  authorizationCode: string;
  redirectUri: string;
  mode: OAuthFlowMode;
  accountId?: string;
};

export type TokenRefreshResult = {
  accountId: string;
  refreshed: boolean;
  expiresAt: string | null;
  status: string;
};
