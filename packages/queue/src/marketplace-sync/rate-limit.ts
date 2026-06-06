import type { MarketplaceProvider } from '@prisma/client';

export type ProviderRateLimitConfig = {
  requestsPerMinute: number;
  burstSize: number;
};

const PROVIDER_RATE_LIMITS: Record<MarketplaceProvider, ProviderRateLimitConfig> = {
  SHOPEE: { requestsPerMinute: 600, burstSize: 20 },
  TOKOPEDIA: { requestsPerMinute: 600, burstSize: 20 },
  LAZADA: { requestsPerMinute: 500, burstSize: 20 },
};

export function getProviderRateLimitConfig(provider: MarketplaceProvider): ProviderRateLimitConfig {
  return PROVIDER_RATE_LIMITS[provider];
}

/** In-process token bucket — enough to pace a single worker; not distributed. */
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
    const refillTokens = ((now - this.lastRefillAt) / 60_000) * this.config.requestsPerMinute;

    if (refillTokens >= 1) {
      this.tokens = Math.min(this.config.burstSize, this.tokens + Math.floor(refillTokens));
      this.lastRefillAt = now;
    }
  }
}

const limiters = new Map<MarketplaceProvider, ProviderRateLimiter>();

export function getProviderRateLimiter(provider: MarketplaceProvider): ProviderRateLimiter {
  const existing = limiters.get(provider);
  if (existing) return existing;

  const limiter = new ProviderRateLimiter(getProviderRateLimitConfig(provider));
  limiters.set(provider, limiter);
  return limiter;
}
