import { describe, expect, it, vi } from 'vitest';

import {
  acquireProviderToken,
  penalizeProvider,
} from '../../src/marketplace-sync/provider-rate-limit-redis.js';

/** A minimal ioredis stand-in: `eval` returns a scripted sequence of wait values. */
function mockRedis(evalReturns: number[], coolingExists = 0) {
  let i = 0;
  return {
    exists: vi.fn(async () => coolingExists),
    eval: vi.fn(async () => evalReturns[Math.min(i++, evalReturns.length - 1)]),
    set: vi.fn(async () => 'OK'),
  };
}

describe('acquireProviderToken (two-tier Redis token bucket)', () => {
  it('returns immediately when a token is available (wait 0)', async () => {
    const redis = mockRedis([0]);
    await acquireProviderToken('LAZADA', 'shop1', redis as never);
    expect(redis.eval).toHaveBeenCalledTimes(1);
  });

  it('retries after the returned wait until a token frees up', async () => {
    const redis = mockRedis([2, 0]); // wait 2ms, then granted
    await acquireProviderToken('LAZADA', 'shop1', redis as never);
    expect(redis.eval).toHaveBeenCalledTimes(2);
  });

  it('halves the effective per-shop rate while the shop is in throttle cooldown', async () => {
    const redis = mockRedis([0], 1); // exists → shop is cooling down
    await acquireProviderToken('LAZADA', 'shop1', redis as never);
    // eval args: [script, 2, shopKey, appKey, now, shopRate, shopBurst, appRate, appBurst, ttl]
    const shopRate = Number(redis.eval.mock.calls[0]?.[5]);
    expect(shopRate).toBe(4); // LAZADA perShopQps 8 → halved to 4 under cooldown
  });

  it('uses the full configured per-shop rate when not cooling', async () => {
    const redis = mockRedis([0], 0);
    await acquireProviderToken('LAZADA', 'shop1', redis as never);
    expect(Number(redis.eval.mock.calls[0]?.[5])).toBe(8); // full ceiling
  });
});

describe('penalizeProvider', () => {
  it('sets a per-shop cooldown key with a TTL', async () => {
    const redis = mockRedis([0]);
    await penalizeProvider('LAZADA', 'shop1', redis as never);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('LAZADA:shop:shop1:cooldown'),
      '1',
      'PX',
      expect.any(Number),
    );
  });
});
