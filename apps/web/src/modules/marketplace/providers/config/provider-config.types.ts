import type { MarketplaceProvider } from '@prisma/client';

export type MarketplaceProviderOAuthConfig = {
  provider: MarketplaceProvider;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
  configured: boolean;
};

export type BuildAuthorizationUrlParams = {
  state: string;
  redirectUri?: string;
};
