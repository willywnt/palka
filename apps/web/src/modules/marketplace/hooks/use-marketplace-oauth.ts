'use client';

import type { MarketplaceProvider } from '@prisma/client';

import type { OAuthStartResponseDto, ProviderOAuthStatusDto } from '../dto/oauth.dto';
import { apiRoutes } from '@/lib/api/routes';

export function buildMarketplaceOAuthStartUrl(input: {
  provider: MarketplaceProvider;
  returnUrl?: string;
  accountId?: string;
}) {
  const params = new URLSearchParams({
    redirect: 'true',
    ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
  });

  return `${apiRoutes.marketplace}/oauth/${input.provider.toLowerCase()}/start?${params.toString()}`;
}

export async function fetchMarketplaceOAuthStatus(): Promise<ProviderOAuthStatusDto[]> {
  const response = await fetch(apiRoutes.marketplaceOAuthStatus, {
    credentials: 'include',
  });

  const body: unknown = await response.json();

  if (!response.ok || !body || typeof body !== 'object' || !('data' in body)) {
    throw new Error('Failed to load marketplace OAuth status.');
  }

  return (body as { data: ProviderOAuthStatusDto[] }).data;
}

export type { OAuthStartResponseDto, ProviderOAuthStatusDto };
