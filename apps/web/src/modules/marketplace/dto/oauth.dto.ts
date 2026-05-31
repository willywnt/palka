import type { MarketplaceAccountStatus, MarketplaceProvider } from '@prisma/client';

import type {
  OAuthCallbackResult,
  OAuthStartResult,
  TokenExchangeInput,
} from '../domain/oauth.types';
import type { MarketplaceAccountDetailDto } from '../dto/marketplace.dto';

export type OAuthStartResponseDto = OAuthStartResult & {
  oauthConfigured: boolean;
};

export type OAuthCallbackResponseDto = OAuthCallbackResult;

export type TokenExchangeResultDto = {
  account: MarketplaceAccountDetailDto;
  mode: 'connect' | 'reconnect';
};

export type OAuthErrorResponseDto = {
  code: string;
  message: string;
  operatorMessage: string;
  returnUrl: string;
};

export type ProviderOAuthStatusDto = {
  provider: MarketplaceProvider;
  oauthConfigured: boolean;
  supportsOAuth: boolean;
  connectable: boolean;
};

export type TokenLifecycleStatusDto = {
  accountId: string;
  provider: MarketplaceProvider;
  status: MarketplaceAccountStatus;
  tokenExpiresAt: string | null;
  refreshFailureCount: number;
  lastValidatedAt: string | null;
  lastRefreshAt: string | null;
};
