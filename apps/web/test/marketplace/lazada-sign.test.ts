import { signLazadaRequest } from '@olshop/marketplace-providers';
import { describe, expect, it } from 'vitest';

/**
 * Pins the Lazada Open Platform signing algorithm. The expected signatures were
 * computed independently (a raw transcription of the LazOP spec), so these
 * assertions catch any regression in the shared signer.
 */
describe('signLazadaRequest (LazOP)', () => {
  it('signs the path + sorted key/value concatenation as upper-case HMAC-SHA256 hex', () => {
    const sign = signLazadaRequest({
      apiPath: '/auth/token/create',
      params: {
        app_key: '123456',
        timestamp: '1700000000000',
        sign_method: 'sha256',
        code: '0_demo',
      },
      appSecret: 'test-secret',
    });

    expect(sign).toBe('7F7B691A0E12A9836F89554C2128901A3282757A825595CFCF0C1DF0E100DF69');
    expect(sign).toMatch(/^[0-9A-F]{64}$/);
  });

  it('excludes the sign param and undefined values, and includes the access token', () => {
    const sign = signLazadaRequest({
      apiPath: '/product/price_quantity/update',
      params: {
        app_key: '123456',
        timestamp: '1700000000000',
        sign_method: 'sha256',
        access_token: 'tok',
        payload: '<Request/>',
        sign: 'IGNORED',
        empty: undefined,
      },
      appSecret: 'secret-xyz',
    });

    expect(sign).toBe('D66565302AF7BAB24275E4E8B36C4EBD621B20357D36B39ED67B895FECE5DDF0');
  });

  it('is independent of the input key order (params are sorted before signing)', () => {
    const ascending = signLazadaRequest({
      apiPath: '/x',
      params: { a: '1', b: '2', c: '3' },
      appSecret: 's',
    });
    const shuffled = signLazadaRequest({
      apiPath: '/x',
      params: { c: '3', a: '1', b: '2' },
      appSecret: 's',
    });

    expect(shuffled).toBe(ascending);
  });
});
