/**
 * Lazada MULTI-WAREHOUSE spike probe (dev-only, throwaway — NOT shipped code).
 *
 * De-risks the one load-bearing unknown before we touch production: does this seller
 * account even have multi-warehouse SKUs, and what is the EXACT write payload element
 * name for a per-warehouse quantity (`<Quantity>` vs `<SellableQuantity>`)?
 *
 * It deliberately does NOT use the production `buildLazadaSellableStockPayload` (that
 * builder only knows the bare single-warehouse payload — extending it is step 6, AFTER
 * this probe confirms the element name). The XML here is built inline so we can try both
 * candidate element names without committing production code to a guess.
 *
 * ── READ (safe, read-only) ──────────────────────────────────────────────────────────
 *   pnpm lazada:mw-probe read <access_token>
 *   Pages /products/get and, per SKU, prints item_id / SkuId / SellerSku / top-level
 *   quantity and ANY property whose key matches /warehouse|inventory/i (so we discover
 *   the real field names + casing instead of assuming). Summarizes how many SKUs are
 *   multi-warehouse and the distinct warehouse codes seen. Use this first to decide if
 *   the gap is an ACTIVE bug for this account or future insurance, and to pick a test SKU.
 *
 * ── READ-ONE (focused read-back of a single item via /product/item/get) ───────────────
 *   pnpm lazada:mw-probe read-one <access_token> <item_id>
 *   Same per-SKU warehouse breakdown but for ONE item — use it after a write probe so the
 *   read-back doesn't dump the whole catalog.
 *
 * ── WRITE (set/read-back; use CURRENT values for a safe no-op) ───────────────────────
 *   pnpm lazada:mw-probe write <access_token> <item_id> <sku_id> <element> <wh:qty>...
 *     <element> = Quantity | SellableQuantity   (which inner element to probe)
 *     <wh:qty>  = one or more warehouseCode:quantity pairs, e.g.  whA:8  whB:0
 *   Builds <MultiWarehouseInventories><MultiWarehouseInventory><WarehouseCode>..
 *   </WarehouseCode><{element}>..</{element}></MultiWarehouseInventory>..> and POSTs it
 *   to /product/stock/sellable/update. SAFETY: pass each warehouse its CURRENT sellable
 *   (from the read) so the call is a no-op that still proves acceptance + element name.
 *   Then re-run `read` to confirm the values stuck. If `Quantity` is rejected, retry with
 *   `SellableQuantity` (and vice-versa) — whichever the envelope accepts is the truth.
 *
 * Reads LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_API_BASE_URL from .env or apps/web/.env.local.
 * Get a token via `pnpm lazada:token <code>` (OAuth) or `pnpm lazada:token -- --refresh <refresh_token>`.
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

if (!appKey || !appSecret) {
  console.error(
    'Missing LAZADA_APP_KEY / LAZADA_APP_SECRET. Set them in .env or apps/web/.env.local.',
  );
  process.exit(1);
}

const client = createLazadaClient({ appKey, appSecret, baseUrl });
const mode = process.argv[2];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Pull every product page (paced) so a multi-warehouse SKU buried on a later page isn't missed. */
async function fetchAllProducts(accessToken) {
  const products = [];
  for (let page = 0; page < 20; page += 1) {
    const res = await client.call('/products/get', {
      method: 'GET',
      accessToken,
      params: { filter: 'all', limit: 50, offset: page * 50 },
    });
    if (!isLazadaSuccess(res)) {
      console.error(
        `\n❌ /products/get failed on page ${page}: code=${res.code} message=${res.message ?? '-'}`,
      );
      console.error(JSON.stringify(res.raw, null, 2));
      process.exitCode = 1;
      break;
    }
    const batch = Array.isArray(res.raw?.data?.products) ? res.raw.data.products : [];
    products.push(...batch);
    if (batch.length < 50) break;
    await sleep(1200);
  }
  return products;
}

/** Print one SKU's warehouse breakdown; returns true when it is multi-warehouse. */
function reportSku(sku, itemId, name, warehouseCodes) {
  // Surface ANY warehouse/inventory-shaped property so we capture the real field names +
  // casing (multiWarehouseInventories, fblWarehouseInventories, etc.) instead of assuming.
  const whProps = Object.fromEntries(
    Object.entries(sku).filter(([key]) => /warehouse|inventory/i.test(key)),
  );
  const mwi = sku.multiWarehouseInventories ?? sku.MultiWarehouseInventories ?? null;
  const isMulti = Array.isArray(mwi) && mwi.length > 0;
  if (isMulti) {
    for (const w of mwi) {
      const code = w.warehouseCode ?? w.WarehouseCode;
      if (code) warehouseCodes.add(code);
    }
  }

  console.log(
    `• ${name} | item_id=${itemId} SkuId=${sku.SkuId ?? '?'} SellerSku=${sku.SellerSku ?? '-'} ` +
      `quantity=${sku.quantity ?? '?'}${isMulti ? '  [MULTI-WAREHOUSE]' : ''}`,
  );
  if (Object.keys(whProps).length > 0) {
    console.log(`    warehouse fields: ${JSON.stringify(whProps)}`);
  }
  return isMulti;
}

async function runReadOne(accessToken, itemId) {
  if (!accessToken || !itemId) {
    console.error('Usage:\n  pnpm lazada:mw-probe read-one <access_token> <item_id>');
    process.exit(1);
  }
  console.log(`Reading /product/item/get for item_id=${itemId}...\n`);
  const res = await client.call('/product/item/get', {
    method: 'GET',
    accessToken,
    params: { item_id: itemId },
  });
  if (!isLazadaSuccess(res)) {
    console.error(`❌ /product/item/get failed: code=${res.code} message=${res.message ?? '-'}`);
    console.error(JSON.stringify(res.raw, null, 2));
    process.exitCode = 1;
    return;
  }
  const product = res.raw?.data?.item ?? res.raw?.data ?? {};
  const name = product.attributes?.name ?? '(no name)';
  const warehouseCodes = new Set();
  for (const sku of product.skus ?? []) reportSku(sku, itemId, name, warehouseCodes);
  console.log(`\ndistinct warehouseCodes: ${[...warehouseCodes].join(', ') || '(none)'}`);
}

async function runRead(accessToken) {
  console.log('Reading /products/get (all pages) and reporting per-SKU warehouse breakdown...\n');
  const products = await fetchAllProducts(accessToken);
  console.log(`products returned: ${products.length}\n`);

  const warehouseCodes = new Set();
  let multiWarehouseSkus = 0;
  let totalSkus = 0;

  for (const product of products) {
    const itemId = product.item_id ?? product.itemId ?? '?';
    const name = product.attributes?.name ?? '(no name)';
    for (const sku of product.skus ?? []) {
      totalSkus += 1;
      if (reportSku(sku, itemId, name, warehouseCodes)) multiWarehouseSkus += 1;
    }
  }

  console.log('\n──────── SUMMARY ────────');
  console.log(`total SKUs:            ${totalSkus}`);
  console.log(`multi-warehouse SKUs:  ${multiWarehouseSkus}`);
  console.log(
    `distinct warehouseCodes: ${warehouseCodes.size > 0 ? [...warehouseCodes].join(', ') : '(none seen)'}`,
  );
  if (multiWarehouseSkus === 0) {
    console.log(
      '\n→ No multi-warehouse SKUs on this account. The gap is FUTURE INSURANCE, not an active bug.',
    );
  } else {
    console.log(
      '\n→ Multi-warehouse SKUs exist. Pick one (item_id + SkuId above), note each warehouse current sellable,' +
        '\n  then run the WRITE probe with those CURRENT values (safe no-op) to confirm the element name.',
    );
  }
}

async function runWrite(args) {
  const [accessToken, itemId, skuId, element, ...pairs] = args;
  if (!accessToken || !itemId || !skuId || !element || pairs.length === 0) {
    console.error(
      'Usage:\n  pnpm lazada:mw-probe write <access_token> <item_id> <sku_id> <Quantity|SellableQuantity> <wh:qty>...',
    );
    process.exit(1);
  }
  if (element !== 'Quantity' && element !== 'SellableQuantity') {
    console.error(`<element> must be "Quantity" or "SellableQuantity", got "${element}".`);
    process.exit(1);
  }

  const warehouseEntries = pairs.map((pair) => {
    const idx = pair.lastIndexOf(':');
    const code = pair.slice(0, idx);
    const qty = Number(pair.slice(idx + 1));
    if (!code || !Number.isFinite(qty)) {
      console.error(`Bad <wh:qty> pair "${pair}". Expected warehouseCode:quantity, e.g. whA:8`);
      process.exit(1);
    }
    return { code, qty };
  });

  const mwiXml = warehouseEntries
    .map(
      (w) =>
        `<MultiWarehouseInventory><WarehouseCode>${escapeXml(w.code)}</WarehouseCode>` +
        `<${element}>${w.qty}</${element}></MultiWarehouseInventory>`,
    )
    .join('');
  const payload =
    `<Request><Product><Skus><Sku>` +
    `<ItemId>${escapeXml(itemId)}</ItemId><SkuId>${escapeXml(skuId)}</SkuId>` +
    `<MultiWarehouseInventories>${mwiXml}</MultiWarehouseInventories>` +
    `</Sku></Skus></Product></Request>`;

  console.log(`Probing inner element <${element}> on ItemId=${itemId} SkuId=${skuId}`);
  console.log(`warehouses: ${warehouseEntries.map((w) => `${w.code}=${w.qty}`).join(', ')}`);
  console.log(`payload: ${payload}\n`);

  const res = await client.call('/product/stock/sellable/update', {
    method: 'POST',
    accessToken,
    params: { payload },
  });

  console.log('Envelope:');
  console.log(`  code: ${res.code}  type: ${res.type ?? '-'}  message: ${res.message ?? '-'}`);
  console.log(`  requestId: ${res.requestId ?? '-'}`);
  console.log('\n--- raw response ---');
  console.log(JSON.stringify(res.raw, null, 2));

  // Even a code:0 envelope can carry a per-SKU rejection in detail[] — surface it.
  const detail = Array.isArray(res.raw?.detail) ? res.raw.detail : [];
  if (isLazadaSuccess(res) && detail.length === 0) {
    console.log(
      `\n✅ Accepted with <${element}>. Re-run \`pnpm lazada:mw-probe read <token>\` to confirm the values stuck.`,
    );
  } else {
    console.log(
      `\n❌ Rejected (or detail[] error) with <${element}>. Retry with the other element name. Paste this whole output.`,
    );
    process.exitCode = 1;
  }
}

if (mode === 'read') {
  await runRead(process.argv[3]);
} else if (mode === 'read-one') {
  await runReadOne(process.argv[3], process.argv[4]);
} else if (mode === 'write') {
  await runWrite(process.argv.slice(3));
} else {
  console.error(
    'Usage:\n' +
      '  pnpm lazada:mw-probe read     <access_token>\n' +
      '  pnpm lazada:mw-probe read-one <access_token> <item_id>\n' +
      '  pnpm lazada:mw-probe write    <access_token> <item_id> <sku_id> <Quantity|SellableQuantity> <wh:qty>...',
  );
  process.exit(1);
}
