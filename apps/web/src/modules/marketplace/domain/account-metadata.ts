export type MarketplaceAccountMetadata = {
  connectMode?: 'manual' | 'oauth';
  reconnectMode?: 'manual' | 'oauth';
  lastValidatedAt?: string;
  lastValidationError?: string;
  lastRefreshAt?: string;
  lastRefreshError?: string;
  refreshFailureCount?: number;
  oauthConnectedAt?: string;
  oauthReconnectedAt?: string;
  disconnectedAt?: string;
  providerMetadata?: Record<string, unknown>;
};

export function parseAccountMetadata(value: unknown): MarketplaceAccountMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as MarketplaceAccountMetadata;
}

export function mergeAccountMetadata(
  current: unknown,
  patch: MarketplaceAccountMetadata,
): MarketplaceAccountMetadata {
  return {
    ...parseAccountMetadata(current),
    ...patch,
  };
}

export function toAccountMetadataJson(
  metadata: MarketplaceAccountMetadata,
): Record<string, unknown> {
  return metadata as Record<string, unknown>;
}
