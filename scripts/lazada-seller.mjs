/**
 * Dump the Lazada /seller/get profile for the connected seller. Useful when stock-write
 * returns SELLER_NOT_PERMITTED — the seller's tier/type fields here hint at whether the
 * account is LazMall / API-write-eligible. Read-only.
 *
 * Usage (builds the provider package first):
 *   pnpm lazada:seller <access_token>
 *
 * Reads LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_API_BASE_URL from .env or apps/web/.env.local.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
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
const accessToken = process.argv[2];

if (!appKey || !appSecret) {
  console.error(
    'Missing LAZADA_APP_KEY / LAZADA_APP_SECRET. Set them in .env or apps/web/.env.local.',
  );
  process.exit(1);
}
if (!accessToken) {
  console.error('Usage: pnpm lazada:seller <access_token>');
  process.exit(1);
}

const client = createLazadaClient({ appKey, appSecret, baseUrl });
const res = await client.call('/seller/get', { method: 'GET', accessToken });

console.log('Envelope:');
console.log(`  code: ${res.code}  type: ${res.type ?? '-'}  message: ${res.message ?? '-'}`);
console.log(`  requestId: ${res.requestId ?? '-'}`);
console.log('\n--- raw seller profile ---');
console.log(JSON.stringify(res.raw, null, 2));

if (isLazadaSuccess(res)) {
  console.log(
    '\nLook for tier/type fields (e.g. seller_type / shop type / is/lazmall). Paste this so we can read it together.',
  );
} else {
  console.log('\n❌ Call failed — paste this whole output.');
  process.exitCode = 1;
}
