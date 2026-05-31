import { MARKETPLACE_SYNC_RATE_LIMIT_PER_MINUTE } from '@olshop/config/limits';
import type { MarketplaceProvider } from '@prisma/client';

/** Foundation for provider-aware throttling — not a distributed limiter yet. */
export type ProviderRateLimitConfig = {
  requestsPerMinute: number;
  burstSize: number;
};

const DEFAULT_CONFIG: ProviderRateLimitConfig = {
  requestsPerMinute: MARKETPLACE_SYNC_RATE_LIMIT_PER_MINUTE,
  burstSize: 10,
};

const PROVIDER_OVERRIDES: Partial<Record<MarketplaceProvider, ProviderRateLimitConfig>> = {
  SHOPEE: { requestsPerMinute: 40, burstSize: 5 },
  TOKOPEDIA: { requestsPerMinute: 30, burstSize: 5 },
};

export function getProviderRateLimitConfig(provider: MarketplaceProvider): ProviderRateLimitConfig {
  return PROVIDER_OVERRIDES[provider] ?? DEFAULT_CONFIG;
}

/** In-process token bucket — sufficient for single-worker pacing foundation. */
export class ProviderRateLimiter {
  private tokens: number;
  private lastRefillAt: number;

  constructor(private readonly config: ProviderRateLimitConfig) {
    this.tokens = config.burstSize;
    this.lastRefillAt = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitMs = Math.ceil(60_000 / this.config.requestsPerMinute);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    const tokensToAdd = (elapsed / 60_000) * this.config.requestsPerMinute;

    if (tokensToAdd >= 1) {
      this.tokens = Math.min(this.config.burstSize, this.tokens + tokensToAdd);
      this.lastRefillAt = now;
    }
  }
}

const limiterRegistry = new Map<MarketplaceProvider, ProviderRateLimiter>();

export function getProviderRateLimiter(provider: MarketplaceProvider): ProviderRateLimiter {
  const existing = limiterRegistry.get(provider);
  if (existing) return existing;

  const limiter = new ProviderRateLimiter(getProviderRateLimitConfig(provider));
  limiterRegistry.set(provider, limiter);
  return limiter;
}
