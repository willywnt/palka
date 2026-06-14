/**
 * Push a stock quantity to ONE Lazada SKU via /product/price_quantity/update — the same
 * payload the worker ships (buildLazadaQuantityPayload). Verifies the outbound write path
 * in isolation (no Redis/worker). WARNING: this changes REAL stock on Lazada — use a
 * throwaway test SKU.
 *
 * Usage (builds the provider package first):
 *   pnpm lazada:stock <access_token> <item_id> <sku_id> <quantity>
 * (item_id + sku_id come from the import dump; Lazada deprecated SellerSku for this API.)
 *
 * Reads LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_API_BASE_URL from .env or apps/web/.env.local.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildLazadaQuantityPayload,
  createLazadaClient,
  isLazadaSuccess,
} from '../packages/marketplace-providers/dist/index.js';

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
const [, , accessToken, itemId, skuId, quantityArg] = process.argv;
const quantity = Number(quantityArg);

if (!appKey || !appSecret) {
  console.error(
    'Missing LAZADA_APP_KEY / LAZADA_APP_SECRET. Set them in .env or apps/web/.env.local.',
  );
  process.exit(1);
}
if (!accessToken || !itemId || !skuId || !Number.isFinite(quantity)) {
  console.error('Usage: pnpm lazada:stock <access_token> <item_id> <sku_id> <quantity>');
  process.exit(1);
}

const payload = buildLazadaQuantityPayload({
  externalProductId: itemId,
  externalVariantId: skuId,
  quantity,
});
console.log(`Pushing quantity=${quantity} to ItemId=${itemId} SkuId=${skuId}`);
console.log(`payload: ${payload}`);

const client = createLazadaClient({ appKey, appSecret, baseUrl });
const res = await client.call('/product/price_quantity/update', {
  method: 'POST',
  accessToken,
  params: { payload },
});

console.log('\nEnvelope:');
console.log(`  code: ${res.code}  type: ${res.type ?? '-'}  message: ${res.message ?? '-'}`);
console.log(`  requestId: ${res.requestId ?? '-'}`);
console.log('\n--- raw response ---');
console.log(JSON.stringify(res.raw, null, 2));

if (isLazadaSuccess(res)) {
  console.log(
    `\n✅ Stock pushed. Check SkuId ${skuId} in Lazada Seller Center — it should read ${quantity}.`,
  );
} else {
  console.log('\n❌ Push failed — paste this whole output.');
  process.exitCode = 1;
}
