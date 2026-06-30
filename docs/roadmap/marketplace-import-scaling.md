# Marketplace import + pull scaling — design, status & how it works

Status: **shipped on branch `session/2026-06-30-marketplace-import-scale`** (13 commits; owner QA +
push/PR to main owed). Triggered by a real Lazada test account: importing ~2.5k products threw
`901 E0901 Limit service request speed`. Fixed + made the marketplace API paths scale-ready, then
applied the same lesson to the order pull, plus a notification-tray fix. Two adversarial-review
workflows ran (27 agents, then 10); all confirmed findings fixed. Detail rules:
`.cursor/rules/40-inventory-marketplace.mdc`. Lazada API/OAuth facts: the `olshop-lazada-integration`
memory + `docs/roadmap/lazada-order-pull.md`.

## 1. The shared rate limiter (the spine — reuse this for Shopee/Tokopedia)

`packages/queue/src/marketplace-sync/provider-rate-limit-redis.ts` — a **Redis two-tier token bucket**
that replaces the old in-process `ProviderRateLimiter` (deleted). One shared budget across the web
custom server + every worker (multi-worker safe):

- `acquireProviderToken(provider, shopId, redis?)` — blocks until a token is free under BOTH a
  per-`(provider,shop)` bucket AND a per-`provider` ("app") bucket (a Lua script consumes from both
  atomically). Ceilings are MANUAL in `@palka/config` `MARKETPLACE_RATE_LIMITS`
  (`{ perShopQps, perAppQps, burst }`, already has LAZADA/SHOPEE/TOKOPEDIA entries — tune by hand).
- `penalizeProvider(provider, shopId)` — on a throttle (e.g. 901) HALVES the shop's effective rate
  for a cooldown window, then auto-recovers (adaptive DOWN only, never above your number).
- **ADVISORY + FAIL-OPEN**: each Redis op is timeout-bounded (1.5s) with a 30s overall budget; a
  slow/reconnecting Redis (ioredis offline-queue would otherwise BLOCK, not throw) can never wedge a
  caller — it logs once and proceeds without a token (the provider fetchers self-pace with their own
  delays). `penalizeProvider` is best-effort.

**Used by** the import engine (per page), the sync-stock push, drift reconciliation, and the order
pull. **Pacing a PAGED fetcher** (the fetcher owns its own loop, like `fetchLazadaOrders`) is done by
injecting a `beforeCall?: () => Promise<void>` hook the adapter binds to `acquireProviderToken` —
NOT by importing the limiter into `@palka/marketplace-providers` (that package can't depend on
`@palka/queue`; it would be a circular dep). This is the pattern to copy for any Shopee paged fetcher.

## 2. Async catalog import (Lazada) — background BullMQ job

A large catalog import is no longer a synchronous, blocking request. Flow:

- **Model** `MarketplaceImportJob` (migration `20260630000000`): status PENDING/PROCESSING/COMPLETED/
  PARTIAL/FAILED, progress counters, `offsetCheckpoint` (throttle-resume), `full` flag, timestamps.
  A **partial unique index** (migration `20260630020000`, raw SQL — `db push` won't create it, use
  `migrate deploy`) enforces ONE active import per connection (the atomic guard against a
  check-then-create double-import race).
- **Route** `POST /marketplaces/[id]/import` (`{ full? }`) → `marketplaceImportJobService.startImport`
  creates the row + enqueues + returns a job DTO; non-Lazada (stub) providers still import
  synchronously inline (`async=false`). The UI polls `GET /marketplaces/[id]/import-job`.
- **Worker** queue `marketplace-import` → `runMarketplaceImport` (`import-engine.ts`,
  concurrency `MARKETPLACE_IMPORT_CONCURRENCY=3`): pages the provider under `acquireProviderToken`,
  streams each page into `MarketplaceProduct` (one batched `$transaction` per page + per-row fallback),
  checkpoints the offset, auto-maps by SKU once at the end, finalizes status, and best-effort writes a
  **per-connection** "import done" notification (supersedes in place — see §5).
- **Resume + safety**: a BullMQ retry resumes from `offsetCheckpoint`. The engine retries transient
  INFRA errors (timeouts/5xx/DB-Redis blips — plain Errors, not `LazadaApiError`) as well as Lazada
  throttles; only a non-transient provider error is one-shot. The incremental watermark advances ONLY
  on a CLEAN run (`errorCount === 0`); a wholly-failed page re-throws (infra → retry).
- **UI** (`marketplace-connection-detail.tsx`): the "Impor listing" button is a dropdown — "Impor
  perubahan terbaru" (incremental, default) vs "Impor ulang semua" (full). A progress banner polls +
  reconnects on refresh; completion toasts once.
- **Incremental** (`MarketplaceConnection.listingsSyncedThrough`, migration `20260630010000`): a
  non-full import sends Lazada `update_after = listingsSyncedThrough − 10min overlap`; advanced to the
  run start only on a complete import (mirrors the orders `ordersSyncedThrough` cursor). `fetchLazadaListingsPage`
  (single-page) is the import's per-page fetcher.

**Gotcha (live-verified):** Lazada **GetProducts caps `limit` at 50** — `100+` returns `E019 Invalid
Limit`. `PAGE_LIMIT`/`IMPORT_PAGE_LIMIT = 50`. (GetOrders is `limit 100`.)

## 3. Order pull — Phase A (per-call pacing) DONE; Phase B designed, deferred

The order pull is ALREADY incremental (cursor + 30s cooldown + VPS auto-pull), so "many orders" only
bites on the first 30-day backfill / a manual full re-sync. The apply is already per-order idempotent

- re-pull-safe, so the real problem was pacing, not correctness.

* **Phase A (DONE, `c94e42f`):** a `beforeCall` hook threaded through `fetchLazadaOrders` →
  `callWithRetry` (one chokepoint covering every header page + every item batch) acquires a token;
  the adapter binds `acquireProviderToken('LAZADA', shopId)`. The old coarse "one token before the
  whole pull" tripped 901 on a big backfill.
* **Phase B (DESIGNED, NOT built):** resumable backfill = a **WINDOWED backfill** — walk the 30-day
  window in completable 7-day slices, each a normal all-or-nothing `complete` pull, with a
  `backfillThrough` marker advanced only on a `complete` slice. Needs a Lazada upper-bound window
  param (verify `update_before` on a live shop, or clamp client-side). **Do NOT** use a per-order
  timestamp cursor (the same-`updated_at` cohort → skip / live-lock trap). **Do NOT** port the apply
  to a worker (reserve/ship/release + propagate + mapping + returns is deeply web-side server-only —
  boundary-expensive, no benefit at realistic sizes).
* **The real scale answer = the Lazada Trade Order webhook** (push > poll): orders arrive one-at-a-time,
  poll becomes a thin backstop. Shares the spine with `docs/roadmap/whatsapp-integration.md`.

## 4. Limiter migration (sync / drift / order-pull)

`refactor` `68d5f0d`: the sync-stock push, drift reconciliation, and order pull moved off the deleted
in-process limiter onto `acquireProviderToken`. Same per-operation granularity as before, now
Redis-distributed (multi-worker safe). The import path already used it.

## 5. Notification tray fix (`e08be89c`)

The tray tone-sorted the WHOLE feed ("urgent floats to top"), so a stale FAILED import floated above
its newer SUCCESS. Fixed (`merge-notifications.ts`): two bands — live derived "needs attention"
signals (urgent-first, never stale) lead, then the persisted EVENT feed strictly newest-first, NEVER
tone-reordered (urgency still reads via the inline alert icon + red bell badge, not position). Import
notifications now supersede per CONNECTION (upsert + re-surface unread), not per run.

## 6. Deferred / for the next integration (Shopee sandbox)

- **Shopee adapters can reuse everything here**: `acquireProviderToken` (config already has a SHOPEE
  entry), the `beforeCall` paging pattern, the env-gated adapter/stub fallback. The async import ENGINE
  is **Lazada-only today** (it branches on provider + uses `fetchLazadaListingsPage`) — a Shopee
  background import would need the engine generalized or a Shopee single-page fetcher; the stub Shopee
  import stays synchronous until then.
- Order-pull **Phase B windowed backfill** + the **webhook** (above) — build when a real busy shop demands it.
- Multi-SKU-per-call sync batching — `docs/roadmap/sync-batching.md` (separate, not started).
