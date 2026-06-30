import { MARKETPLACE_RATE_LIMITS, MARKETPLACE_THROTTLE_COOLDOWN_MS } from '@palka/config/limits';
import { logger } from '@palka/utils/logger';
import type { MarketplaceProvider } from '@prisma/client';
import type { Redis } from 'ioredis';

import { getSharedRedisConnection } from '../connection/redis.js';

const KEY_PREFIX = 'mp:rl';
/** Idle buckets expire so Redis isn't littered with per-shop keys forever. */
const BUCKET_TTL_MS = 300_000;
/** Cap a single inter-attempt sleep so the loop stays responsive on a long wait. */
const MAX_ACQUIRE_WAIT_MS = 5_000;
/** Cap a single Redis op so a slow/reconnecting Redis can't block the caller — ioredis would
 *  otherwise QUEUE the command (offline queue) and wait for reconnect. Rate limiting is ADVISORY
 *  (the provider fetchers self-pace), so we fail OPEN on a timeout/error: proceed without a token. */
const REDIS_OP_TIMEOUT_MS = 1_500;
/** Never block a caller on the limiter longer than this in total (then proceed without a token). */
const ACQUIRE_BUDGET_MS = 30_000;

/** Reject if the Redis op doesn't settle within `ms`, so a degraded Redis can't hang the caller. */
async function withTimeout<T>(op: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('redis op timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Atomic TWO-TIER token-bucket acquire. Refills both the per-(provider,shop) and the per-provider
 * ("app") bucket, and only consumes a token from EACH when BOTH have ≥1 — so a call is paced by
 * whichever ceiling is tighter (per-seller limit vs the shared app_key total). Returns 0 when a
 * token was taken, else the ms to wait before retrying. State per bucket = hash { t, ts }.
 *   KEYS[1]=shopKey KEYS[2]=appKey · ARGV: now, shopRate, shopBurst, appRate, appBurst, ttlMs
 */
const ACQUIRE_SCRIPT = `
local now = tonumber(ARGV[1])
local function refill(key, rate, burst)
  local d = redis.call('HMGET', key, 't', 'ts')
  local tokens = tonumber(d[1])
  local ts = tonumber(d[2])
  if tokens == nil then return burst end
  local elapsed = now - ts
  if elapsed < 0 then elapsed = 0 end
  return math.min(burst, tokens + elapsed * rate / 1000.0)
end
local shopRate = tonumber(ARGV[2])
local shopBurst = tonumber(ARGV[3])
local appRate = tonumber(ARGV[4])
local appBurst = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])
local shopTokens = refill(KEYS[1], shopRate, shopBurst)
local appTokens = refill(KEYS[2], appRate, appBurst)
if shopTokens >= 1 and appTokens >= 1 then
  redis.call('HSET', KEYS[1], 't', shopTokens - 1, 'ts', now)
  redis.call('HSET', KEYS[2], 't', appTokens - 1, 'ts', now)
  redis.call('PEXPIRE', KEYS[1], ttl)
  redis.call('PEXPIRE', KEYS[2], ttl)
  return 0
end
redis.call('HSET', KEYS[1], 't', shopTokens, 'ts', now)
redis.call('HSET', KEYS[2], 't', appTokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], ttl)
redis.call('PEXPIRE', KEYS[2], ttl)
local waitShop = 0
if shopTokens < 1 then waitShop = math.ceil((1 - shopTokens) * 1000.0 / shopRate) end
local waitApp = 0
if appTokens < 1 then waitApp = math.ceil((1 - appTokens) * 1000.0 / appRate) end
if waitShop > waitApp then return waitShop else return waitApp end
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shopKey(provider: MarketplaceProvider, shopId: string): string {
  return `${KEY_PREFIX}:${provider}:shop:${shopId}`;
}
function appKey(provider: MarketplaceProvider): string {
  return `${KEY_PREFIX}:${provider}:app`;
}
function cooldownKey(provider: MarketplaceProvider, shopId: string): string {
  return `${KEY_PREFIX}:${provider}:shop:${shopId}:cooldown`;
}
function rateConfig(provider: MarketplaceProvider): {
  perShopQps: number;
  perAppQps: number;
  burst: number;
} {
  return MARKETPLACE_RATE_LIMITS[provider] ?? { perShopQps: 5, perAppQps: 20, burst: 10 };
}

/**
 * Block until a token is available for (provider, shop) under BOTH the per-shop and per-app
 * ceilings (Redis-shared across all workers/processes). While the shop is in a throttle cooldown
 * (see {@link penalizeProvider}) its effective per-shop rate is HALVED — paced harder until the
 * cooldown expires, then it recovers to the configured ceiling. Ceilings are manual
 * (MARKETPLACE_RATE_LIMITS); the only automatic move is DOWN during a throttle window.
 */
export async function acquireProviderToken(
  provider: MarketplaceProvider,
  shopId: string,
  redis: Redis = getSharedRedisConnection(),
): Promise<void> {
  const cfg = rateConfig(provider);
  const sKey = shopKey(provider, shopId);
  const aKey = appKey(provider);
  const deadline = Date.now() + ACQUIRE_BUDGET_MS;

  for (;;) {
    let wait: number;
    try {
      const cooling =
        (await withTimeout(redis.exists(cooldownKey(provider, shopId)), REDIS_OP_TIMEOUT_MS)) === 1;
      const shopRate = cooling ? Math.max(1, cfg.perShopQps / 2) : cfg.perShopQps;
      wait = Number(
        await withTimeout(
          redis.eval(
            ACQUIRE_SCRIPT,
            2,
            sKey,
            aKey,
            String(Date.now()),
            String(shopRate),
            String(cfg.burst),
            String(cfg.perAppQps),
            String(cfg.burst),
            String(BUCKET_TTL_MS),
          ),
          REDIS_OP_TIMEOUT_MS,
        ),
      );
    } catch (error) {
      // Fail OPEN: a down/slow Redis must never wedge the caller — proceed without a token.
      logger.warn('marketplace.ratelimit.degraded', {
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (wait <= 0) return;
    const nap = Math.min(wait, MAX_ACQUIRE_WAIT_MS);
    if (Date.now() + nap > deadline) return; // limiter budget exhausted — proceed rather than block
    await sleep(nap);
  }
}

/**
 * Record that this shop just hit a provider throttle (e.g. Lazada 901): halve its effective rate
 * for the cooldown window (adaptive DOWN only). Recovers automatically when the key TTL expires.
 */
export async function penalizeProvider(
  provider: MarketplaceProvider,
  shopId: string,
  redis: Redis = getSharedRedisConnection(),
): Promise<void> {
  try {
    await withTimeout(
      redis.set(cooldownKey(provider, shopId), '1', 'PX', MARKETPLACE_THROTTLE_COOLDOWN_MS),
      REDIS_OP_TIMEOUT_MS,
    );
  } catch (error) {
    // Best-effort — a degraded Redis must not fail the caller's flow.
    logger.warn('marketplace.ratelimit.penalize_failed', {
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
