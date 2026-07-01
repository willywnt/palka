import { createHmac } from 'node:crypto';

import { parseShopeePush, SHOPEE_PUSH_CODE, verifyShopeePush } from '@palka/marketplace-providers';
import { describe, expect, it } from 'vitest';

/**
 * Pins the Shopee push webhook verifier. The load-bearing (live-confirmed) algorithm: the receiver
 * computes HMAC-SHA256(partner_key, `${callbackUrl}|${rawBody}`) as LOWER-case hex over the RAW bytes
 * and compares it constant-time to the raw `Authorization` header. `callbackUrl` is the exact
 * registered URL, NOT request.url.
 */
const KEY = 'shpk-partner-key-abcdef';
const CB = 'https://app.trypalka.com/api/v1/webhooks/shopee';
const sign = (url: string, body: string, key = KEY): string =>
  createHmac('sha256', key).update(`${url}|${body}`, 'utf8').digest('hex');

describe('verifyShopeePush', () => {
  const body = '{"shop_id":227699564,"code":3,"data":"{\\"ordersn\\":\\"250701ABC\\"}"}';

  it('accepts a correctly signed push', () => {
    expect(
      verifyShopeePush({
        callbackUrl: CB,
        rawBody: body,
        authorizationHeader: sign(CB, body),
        partnerKey: KEY,
      }),
    ).toBe(true);
  });

  it('rejects a tampered body (verify is over the raw bytes)', () => {
    expect(
      verifyShopeePush({
        callbackUrl: CB,
        rawBody: `${body} `, // one trailing byte differs
        authorizationHeader: sign(CB, body),
        partnerKey: KEY,
      }),
    ).toBe(false);
  });

  it('rejects a shifted base string (wrong callback URL / spoofed host)', () => {
    expect(
      verifyShopeePush({
        callbackUrl: 'https://evil.example/api/v1/webhooks/shopee',
        rawBody: body,
        authorizationHeader: sign(CB, body),
        partnerKey: KEY,
      }),
    ).toBe(false);
  });

  it('rejects a wrong key, a missing header, and an unset partner key', () => {
    expect(
      verifyShopeePush({
        callbackUrl: CB,
        rawBody: body,
        authorizationHeader: sign(CB, body, 'other-key'),
        partnerKey: KEY,
      }),
    ).toBe(false);
    expect(
      verifyShopeePush({
        callbackUrl: CB,
        rawBody: body,
        authorizationHeader: null,
        partnerKey: KEY,
      }),
    ).toBe(false);
    expect(
      verifyShopeePush({
        callbackUrl: CB,
        rawBody: body,
        authorizationHeader: sign(CB, body),
        partnerKey: '',
      }),
    ).toBe(false);
  });
});

describe('parseShopeePush', () => {
  it('parses an order push: numeric shop_id → string, data JSON-string unwrapped', () => {
    const env = parseShopeePush(
      '{"shop_id":227699564,"code":3,"timestamp":1782886879,"data":"{\\"ordersn\\":\\"250701ABC\\",\\"status\\":\\"READY_TO_SHIP\\"}"}',
    );
    expect(env?.code).toBe(SHOPEE_PUSH_CODE.ORDER_STATUS);
    expect(env?.shopId).toBe('227699564');
    expect(env?.timestamp).toBe(1782886879);
    expect(env?.data.ordersn).toBe('250701ABC');
  });

  it('parses a partner-level push (no shop_id) with data as an object', () => {
    const env = parseShopeePush('{"code":12,"data":{"partner_id":1237107}}');
    expect(env?.code).toBe(SHOPEE_PUSH_CODE.AUTH_EXPIRY);
    expect(env?.shopId).toBeNull();
    expect(env?.data.partner_id).toBe(1237107);
  });

  it('parses the registration verify ping (code 0) carrying verify_info', () => {
    const env = parseShopeePush('{"code":0,"data":{"verify_info":"abc-123"}}');
    expect(env?.code).toBe(SHOPEE_PUSH_CODE.VERIFY);
    expect(env?.data.verify_info).toBe('abc-123');
    expect(env?.shopId).toBeNull();
  });

  it('returns null for a non-envelope body', () => {
    expect(parseShopeePush('not json at all')).toBeNull();
    expect(parseShopeePush('{"no":"code here"}')).toBeNull();
  });
});
