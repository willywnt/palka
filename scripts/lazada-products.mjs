/**
 * Dump the RAW /products/get response so we can verify the real field shapes against
 * what the import adapter assumes (item_id / attributes.name / skus[].SkuId/SellerSku/
 * quantity/Status). Run after exchanging a token.
 *
 * Usage (builds the provider package first):
 *   pnpm lazada:products <access_token>
 *
 * Reads LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_API_BASE_URL from .env or apps/web/.env.local.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const accessToken = process.argv[2];

if (!appKey || !appSecret) {
  console.error(
    'Missing LAZADA_APP_KEY / LAZADA_APP_SECRET. Set them in .env or apps/web/.env.local.',
  );
  process.exit(1);
}
if (!accessToken) {
  console.error('Usage: pnpm lazada:products <access_token>');
  process.exit(1);
}

const client = createLazadaClient({ appKey, appSecret, baseUrl });
const res = await client.call('/products/get', {
  method: 'GET',
  accessToken,
  params: { filter: 'all', limit: 10, offset: 0 },
});

console.log('Envelope:');
console.log(`  code: ${res.code}  type: ${res.type ?? '-'}  message: ${res.message ?? '-'}`);
console.log(`  requestId: ${res.requestId ?? '-'}`);

if (res.code !== '0') {
  console.log('\n❌ Call failed — paste this whole output.');
  // exitCode (not exit()) so we don't abort while the fetch handle is still closing (Node/Windows).
  process.exitCode = 1;
} else {
  const data = res.raw.data ?? {};
  const products = Array.isArray(data.products) ? data.products : [];
  console.log(
    `\ntotal_products: ${data.total_products ?? '?'}   products returned: ${products.length}`,
  );
  // Full raw envelope (definitive) — trims products to the first 2 if there are many.
  const trimmed =
    products.length > 2
      ? { ...res.raw, data: { ...data, products: products.slice(0, 2) } }
      : res.raw;
  console.log('\n--- raw response (first up to 2 products) ---');
  console.log(JSON.stringify(trimmed, null, 2));
  console.log('\nPaste the block above so we can confirm/fix the import field mapping.');
}
