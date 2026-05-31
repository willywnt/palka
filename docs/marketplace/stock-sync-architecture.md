# Marketplace Stock Sync Architecture

Stock synchronization pushes internal inventory quantities to connected marketplace listings. It is **always asynchronous** — inventory mutations never wait for marketplace API latency.

## Why async?

| Concern          | Sync API blocking          | Async BullMQ           |
| ---------------- | -------------------------- | ---------------------- |
| Mutation latency | Adds 200ms–5s+ per change  | ~0ms (enqueue only)    |
| Provider outages | Fails user operations      | Retries in background  |
| Rate limits      | Blocks operators           | Queue pacing + backoff |
| Burst updates    | Timeouts / partial failure | Fan-out per mapping    |

## Lifecycle

```
InventoryMutationService
  ↓ InventoryEvent committed
onInventoryMutated (fire-and-forget)
  ↓
enqueueInventorySyncPropagation
  ↓ BullMQ: inventory-sync / propagate-inventory-stock
Worker: find sync-ready mappings for variant
  ↓ create MarketplaceSyncJob per mapping
  ↓ BullMQ: marketplace-stock-sync / sync-marketplace-stock
Worker: executeStockSync
  ↓ decrypt token → rate limit → provider.updateStock
  ↓ update MarketplaceProduct cache + MarketplaceSyncLog
  ↓ update MarketplaceProviderHealth
```

## Data model

| Model                       | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `MarketplaceSyncJob`        | Persisted job state (payload, attempts, provider response) |
| `MarketplaceSyncLog`        | Per-mapping audit trail                                    |
| `MarketplaceProviderHealth` | API failure/latency snapshot per store                     |

### Sync job status

| Status       | Meaning                                          |
| ------------ | ------------------------------------------------ |
| `PENDING`    | Created, waiting for worker                      |
| `PROCESSING` | Worker executing provider call                   |
| `SUCCESS`    | Stock pushed successfully                        |
| `FAILED`     | Permanent failure (non-retryable or max retries) |
| `RETRYING`   | Failed but will retry with backoff               |
| `DISABLED`   | Operator or system disabled sync                 |

## Idempotency

- **Propagate job**: BullMQ `jobId = propagate:{eventId}` — duplicate mutations with same event do not double-enqueue.
- **Sync job record**: `idempotencyKey = stock:{mappingId}:{eventId}` — skips if already `SUCCESS`.
- **Manual retry**: new idempotency key with timestamp.

## Retry lifecycle

1. Provider timeout / outage → `MarketplaceSyncError` with `retryable: true`
2. Job marked `RETRYING`, BullMQ exponential backoff (5 attempts default)
3. Non-retryable errors (invalid token, broken mapping) → `FAILED` immediately
4. Operator can manual retry from `/dashboard/marketplace/sync`

## Provider abstraction

Internal sync engine uses normalized stock payloads:

- `normalizeStockUpdateRequest` — internal quantity → provider-agnostic shape
- `MarketplaceStockProviderAdapter.updateStock()` — provider-specific HTTP (or dev stub)

Web `MarketplaceProviderAdapter` also exposes `updateStock()` / `validateStockSync()` for future inline validation.

Set `MARKETPLACE_SYNC_DEV_MODE=true` to simulate successful provider responses in workers without wired APIs.

## Rate limiting foundation

`ProviderRateLimiter` in `@olshop/queue` provides in-process token-bucket pacing per provider. Replace with Redis-backed limiter when scaling horizontally.

## Reconciliation (deferred)

`reconciliation.types.ts` defines mismatch detection DTOs. Full reconciliation jobs will compare internal `Inventory.availableStock` vs cached `MarketplaceProduct.stock` and optionally enqueue repair syncs.

## Operational UI

`/dashboard/marketplace/sync` — queue counts, failed/retrying jobs, provider health, inspect payload/response, manual retry.

## API

| Method | Path                                  | Action                   |
| ------ | ------------------------------------- | ------------------------ |
| GET    | `/marketplaces/sync/overview`         | Queue + health summary   |
| GET    | `/marketplaces/sync/jobs`             | List sync jobs           |
| GET    | `/marketplaces/sync/jobs/[id]`        | Job detail               |
| POST   | `/marketplaces/sync/jobs/[id]/retry`  | Manual retry             |
| POST   | `/marketplaces/sync/mappings/disable` | Disable sync for mapping |

## Running workers

Stock sync requires the worker process:

```bash
pnpm dev:worker
```

Without workers, jobs enqueue successfully but remain in Redis until processed.
