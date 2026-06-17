import { buildShopeeSignBase, signShopeeRequest } from '@falka/marketplace-providers';
import { describe, expect, it } from 'vitest';

/**
 * Pins the Shopee Open Platform v2 signing algorithm. Shopee signs a FIXED concatenation
 * (partner_id + api_path + timestamp [+ access_token + shop_id]) — NOT the sorted business
 * params (that's Lazada). The expected signatures were computed independently with
 * `createHmac('sha256', partner_key).update(base).digest('hex')`, so these catch any
 * regression in the base-string assembly (the part most likely to break).
 */
describe('buildShopeeSignBase', () => {
  it('concatenates partner_id + api_path + timestamp for a public call', () => {
    expect(
      buildShopeeSignBase({
        partnerId: '123456',
        apiPath: '/api/v2/shop/auth_partner',
        timestamp: 1700000000,
      }),
    ).toBe('123456/api/v2/shop/auth_partner1700000000');
  });

  it('appends access_token then shop_id for a shop-scoped call', () => {
    expect(
      buildShopeeSignBase({
        partnerId: '123456',
        apiPath: '/api/v2/product/update_stock',
        timestamp: 1700000000,
        accessToken: 'tok-abc',
        shopId: '7890',
      }),
    ).toBe('123456/api/v2/product/update_stock1700000000tok-abc7890');
  });
});

describe('signShopeeRequest', () => {
  it('signs a public call as lower-case HMAC-SHA256 hex', () => {
    const sign = signShopeeRequest({
      partnerId: '123456',
      partnerKey: 'shop-secret',
      apiPath: '/api/v2/shop/auth_partner',
      timestamp: 1700000000,
    });

    expect(sign).toBe('2e83c24023151cdb339e7f0ebb9422f1dfef013ac3c9689d62468e190851c3ca');
    expect(sign).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes the access token + shop id in the shop-scoped signature', () => {
    const sign = signShopeeRequest({
      partnerId: '123456',
      partnerKey: 'shop-secret',
      apiPath: '/api/v2/product/update_stock',
      timestamp: 1700000000,
      accessToken: 'tok-abc',
      shopId: '7890',
    });

    expect(sign).toBe('e6947601fd6ee00ad9d17564d078984cac4985c2221dac16217242171fd76e43');
  });

  it('changes when the shop id changes (shop id is part of the base)', () => {
    const base = {
      partnerId: '123456',
      partnerKey: 'shop-secret',
      apiPath: '/api/v2/product/update_stock',
      timestamp: 1700000000,
      accessToken: 'tok-abc',
    };
    expect(signShopeeRequest({ ...base, shopId: '7890' })).not.toBe(
      signShopeeRequest({ ...base, shopId: '9999' }),
    );
  });
});
