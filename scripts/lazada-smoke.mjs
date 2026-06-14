/**
 * Lazada credential + signer smoke test (no access token needed).
 *
 * Calls /auth/token/create with a dummy code. The point is the ERROR you get back:
 *   - a SIGNATURE error (IncompleteSignature / "request signature does not conform")
 *     => app_key/app_secret or the signing string is wrong.
 *   - an "invalid/expired code" style error => signing + app_key are GOOD (you just
 *     used a fake code). That is the success signal for this smoke test.
 *
 * Usage (builds the provider package first):
 *   pnpm lazada:smoke
 *
 * Reads LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_API_BASE_URL from .env or
 * apps/web/.env.local (or the real process env).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Root scripts can't resolve workspace packages by name, so import the built dist directly
// (the `pnpm lazada:smoke` script builds it first).
import { createLazadaClient } from '../packages/marketplace-providers/dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFiles() {
  for (const file of [join(root, '.env'), join(root, 'apps/web/.env.local')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFiles();

const appKey = process.env.LAZADA_APP_KEY;
const appSecret = process.env.LAZADA_APP_SECRET;
const baseUrl = process.env.LAZADA_API_BASE_URL ?? 'https://api.lazada.co.id/rest';

if (!appKey || !appSecret) {
  console.error(
    'Missing LAZADA_APP_KEY / LAZADA_APP_SECRET. Set them in .env or apps/web/.env.local.',
  );
  process.exit(1);
}

console.log(`Gateway: ${baseUrl}`);
console.log(`App key: ${appKey.slice(0, 4)}…${appKey.slice(-2)} (len ${appKey.length})`);

const client = createLazadaClient({ appKey, appSecret, baseUrl });
const res = await client.call('/auth/token/create', {
  method: 'POST',
  params: { code: 'smoke-test-dummy-code' },
});

console.log('\nResponse envelope:');
console.log(`  code:    ${res.code}`);
console.log(`  type:    ${res.type ?? '-'}`);
console.log(`  message: ${res.message ?? '-'}`);
console.log(`  requestId: ${res.requestId ?? '-'}`);

const sigError = /signature|IncompleteSignature|sign/i.test(`${res.code} ${res.message ?? ''}`);
if (sigError) {
  console.log(
    '\n❌ Looks like a SIGNATURE error — check app_key/app_secret and the signing string.',
  );
  // exitCode (not exit()) so we don't abort while the fetch handle is still closing (Node/Windows).
  process.exitCode = 1;
} else {
  console.log('\n✅ Signature accepted (the code error is expected — it was a dummy code).');
  console.log('   Next: get a real authorization code, then `pnpm lazada:token <code>`.');
}
