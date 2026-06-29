import { closeOptionalRedis, withOptionalRedis } from '@palka/redis';

export { closeOptionalRedis as closeRateLimitRedis };

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
  /**
   * When Redis is unavailable, DENY instead of allowing (fail-closed). Default = fail-open. Set
   * ONLY on security-load-bearing limiters (login / auth / register) so a Redis outage can't
   * silently disable the brute-force throttle; cosmetic/per-user limiters stay fail-open so an
   * outage never blocks legitimate writes.
   */
  failClosed?: boolean;
};

/** The result returned when Redis is unavailable — fail-open by default, fail-closed when asked. */
function unavailableFallback(options: RateLimitOptions): RateLimitResult {
  return options.failClosed
    ? {
        allowed: false,
        limit: options.limit,
        remaining: 0,
        retryAfterSeconds: options.windowSeconds,
      }
    : { allowed: true, limit: options.limit, remaining: options.limit, retryAfterSeconds: 0 };
}

/**
 * Atomic INCR + (conditional) EXPIRE + TTL read in a single round-trip. Doing
 * the increment and expiry as separate commands risks orphaning the key with no
 * TTL if the process dies between them (the window then never resets and the
 * route stays limited forever); a Redis blip between INCR and EXPIRE has the
 * same effect. Re-arming the expiry whenever the TTL is missing (`< 0`) — not
 * only on the first hit — self-heals any such orphaned key. Returns
 * `{count, ttl}`.
 */
const INCR_AND_EXPIRE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

/**
 * Sliding-window counter using an atomic INCR + EXPIRE Lua script.
 * Fails open when Redis is unavailable so the app keeps serving traffic.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  return withOptionalRedis(async (redis) => {
    const redisKey = `ratelimit:${options.key}`;
    const result = (await redis.eval(
      INCR_AND_EXPIRE_SCRIPT,
      1,
      redisKey,
      options.windowSeconds,
    )) as [number, number];
    const [count, ttl] = result;

    const retryAfterSeconds = ttl > 0 ? ttl : options.windowSeconds;
    const remaining = Math.max(options.limit - count, 0);

    return {
      allowed: count <= options.limit,
      limit: options.limit,
      remaining,
      retryAfterSeconds,
    };
  }, unavailableFallback(options));
}

export function buildIpRateLimitKey(prefix: string, ip: string): string {
  return `${prefix}:ip:${ip}`;
}

export function buildUserRateLimitKey(prefix: string, userId: string): string {
  return `${prefix}:user:${userId}`;
}

export async function getRateLimitStatus(options: RateLimitOptions): Promise<RateLimitResult> {
  return withOptionalRedis(async (redis) => {
    const redisKey = `ratelimit:${options.key}`;
    const currentValue = await redis.get(redisKey);
    const count = currentValue ? Number.parseInt(currentValue, 10) : 0;
    const ttl = await redis.ttl(redisKey);
    const retryAfterSeconds = ttl > 0 ? ttl : options.windowSeconds;

    return {
      allowed: count < options.limit,
      limit: options.limit,
      remaining: Math.max(options.limit - count, 0),
      retryAfterSeconds,
    };
  }, unavailableFallback(options));
}

export async function incrementRateLimitCounter(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  return checkRateLimit(options);
}
