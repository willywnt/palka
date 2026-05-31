# Marketplace SKU Mapping Architecture

SKU mapping is the **critical bridge** between internal inventory (source of truth) and marketplace listings. Without accurate mapping, stock sync would push quantities to the wrong listing or fail silently.

## Architecture

```
MarketplaceProviderAdapter.fetchProducts()
  ↓ normalize (MarketplaceProductNormalizer)
  ↓ persist cache (MarketplaceProduct)
  ↓ auto-match (exact SKU / barcode only)
  ↓ manual mapping (MarketplaceMappingService)
MarketplaceProductMapping → future stock sync jobs
```

## Data model

| Model                       | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `MarketplaceProduct`        | Cached marketplace listing snapshot (NOT internal inventory) |
| `MarketplaceProductMapping` | Links `ProductVariant` ↔ `MarketplaceProduct`                |

### Mapping status

| Status          | Meaning                                |
| --------------- | -------------------------------------- |
| `MAPPED`        | Ready for sync (if syncEnabled)        |
| `UNMAPPED`      | Soft-deleted or disconnected mapping   |
| `BROKEN`        | Missing variant or marketplace product |
| `CONFLICT`      | Duplicate or invalid linkage           |
| `SYNC_DISABLED` | Mapped but sync paused                 |

## Normalization strategy

Provider payloads differ (Shopee `item_id`, Tokopedia `product_id`, etc.). All adapters delegate to `MarketplaceProductNormalizer` which outputs:

- `externalProductId`, `externalVariantId`, `externalSku`
- `externalProductName`, `externalVariantName`
- `stock`, `status`, `rawPayload`

Internal code **never** reads raw provider shapes outside the normalizer.

## Auto-matching rationale

Auto-match runs **only** on:

1. Exact SKU match (confidence 1.0)
2. Exact barcode match (confidence 0.95)

Fuzzy name matching is **not** auto-applied — operators map ambiguous products manually to prevent sync accidents.

## Conflict prevention

Before creating a mapping:

- One internal variant per store (`@@unique account + variant`)
- One marketplace product per store (`@@unique account + product`)
- Validation rejects duplicate linkages with `MAPPING_CONFLICT`

## Cache strategy

`MarketplaceProduct` is a **local cache**:

- Updated on import (`lastImportedAt`)
- Avoids constant marketplace API calls
- Prepared for scheduled BullMQ import jobs (`IMPORT_MARKETPLACE_PRODUCTS`)

## API surface

| Method | Path                                      | Action                       |
| ------ | ----------------------------------------- | ---------------------------- |
| POST   | `/marketplaces/[id]/products/import`      | Import + auto-match          |
| GET    | `/marketplaces/[id]/products`             | List cached products         |
| GET    | `/marketplaces/[id]/products/[productId]` | Product detail + raw payload |
| GET    | `/marketplaces/mappings`                  | List mappings                |
| POST   | `/marketplaces/mappings`                  | Create manual mapping        |
| DELETE | `/marketplaces/mappings/[id]`             | Soft-remove mapping          |
| POST   | `/marketplaces/mappings/[id]/validate`    | Reconcile health             |

## UI

`/dashboard/marketplace/mappings` — operational mapping dashboard:

- Import products per store
- View mapped / unmapped / broken
- Manual map modal with internal SKU search
- Clear preview before linking

## Future sync

Stock sync jobs will:

1. Resolve `MarketplaceProductMapping` where `health.syncReady === true`
2. Read internal stock from `Inventory` (via `ProductVariant`)
3. Push to provider using mapped `externalVariantId`

Mapping must be correct before any sync code runs.
