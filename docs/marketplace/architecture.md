# Marketplace Account Architecture

This document describes the marketplace account foundation for the modular commerce platform. It covers **account lifecycle only** — not product sync, stock sync, or order sync.

## Why provider abstraction matters

Marketplace integrations differ in OAuth flows, token refresh, webhooks, and API shapes. Hardcoding `if (provider === 'SHOPEE')` across services creates unmaintainable spaghetti and blocks adding TikTok Shop or Lazada later.

The `MarketplaceProviderAdapter` interface centralizes provider-specific behavior. Business logic calls adapters through a registry — never through string conditionals in API routes or UI.

## Architecture layers

```
Prisma: MarketplaceAccount
  ↓
MarketplaceAccountRepository     (DB access, encrypted token persistence)
  ↓
MarketplaceAccountService        (connect, reconnect, disconnect, lifecycle)
  ↓
MarketplaceProviderAdapter       (per-provider OAuth/API — placeholders today)
  ↓
API routes + Dashboard UI
```

## Data model

`MarketplaceAccount` represents one connected store per user:

| Field                                            | Purpose                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `provider`                                       | SHOPEE, TOKOPEDIA, TIKTOK, LAZADA                                          |
| `externalStoreId`                                | Provider-side store identifier                                             |
| `storeName`                                      | Operator-friendly display name                                             |
| `encryptedAccessToken` / `encryptedRefreshToken` | AES-256-GCM encrypted credentials                                          |
| `tokenExpiresAt`                                 | Token lifecycle tracking                                                   |
| `status`                                         | CONNECTED, EXPIRED, DISCONNECTED, ERROR, RECONNECT_REQUIRED, SYNC_DISABLED |
| `lastConnectedAt` / `lastSyncAt`                 | Operational timestamps                                                     |
| `metadata`                                       | Provider-specific JSON (future sync state)                                 |

Multi-store support: a user can connect multiple stores, including multiple stores on the same provider. Unique constraint: `(userId, provider, externalStoreId)`.

## Token encryption

Tokens are **never stored in plaintext** and **never returned to the browser**.

- `utils/encryption.ts` — AES-256-GCM primitives (`iv:tag:ciphertext` base64)
- `services/encryption.service.ts` — uses `MARKETPLACE_ENCRYPTION_SECRET` from env
- `MarketplaceAccountService.getDecryptedTokens()` — server-only, for future BullMQ workers

Rotation: replace `MARKETPLACE_ENCRYPTION_SECRET` with a re-encryption migration when needed.

## Account lifecycle

```
Connect (manual or OAuth) → CONNECTED
Token expires             → EXPIRED (reconciled from tokenExpiresAt)
Operator disconnect       → DISCONNECTED
Provider validation fail  → RECONNECT_REQUIRED / ERROR
Sync paused               → SYNC_DISABLED
```

`domain/account-health.ts` provides `resolveAccountHealth()` for operational UI and future monitoring.

## Provider adapters

```
providers/
  shopee/shopee.provider.ts
  tokopedia/tokopedia.provider.ts
  tiktok/tiktok.provider.ts
  lazada/lazada.provider.ts
  index.ts                  → getMarketplaceProviderAdapter()
```

Each adapter implements: `connect`, `exchangeToken`, `refreshToken`, `validateConnection`, `disconnect`, `getStoreInfo`.

Today: manual token connect works; OAuth/API methods throw until provider apps are registered.

## OAuth preparation

Routes (foundation only):

- `GET /api/v1/marketplaces/oauth/[provider]/start` — creates CSRF state, returns auth URL metadata
- `GET /api/v1/marketplaces/oauth/[provider]/callback` — validates state, prepares token exchange

`MarketplaceOAuthStateService` holds short-lived state (in-memory dev; Redis in production).

## API surface

| Method | Path                                  | Action                    |
| ------ | ------------------------------------- | ------------------------- |
| GET    | `/api/v1/marketplaces`                | List accounts             |
| POST   | `/api/v1/marketplaces`                | Connect account           |
| GET    | `/api/v1/marketplaces/[id]`           | Account detail            |
| DELETE | `/api/v1/marketplaces/[id]`           | Disconnect                |
| POST   | `/api/v1/marketplaces/[id]/reconnect` | Reconnect with new tokens |

## Future BullMQ jobs

Queue name reserved: `MARKETPLACE_TOKEN_REFRESH`  
Job schema: `REFRESH_MARKETPLACE_TOKENS` — scans expiring accounts and calls `adapter.refreshToken()`.

Worker registration deferred until OAuth is live.

## Boundaries (do not cross)

| Layer             | Must NOT contain                     |
| ----------------- | ------------------------------------ |
| UI components     | Crypto, Prisma, provider API calls   |
| API routes        | Business logic (delegate to service) |
| Provider adapters | Prisma queries                       |
| Repository        | Provider API calls                   |

## Dashboard

`/dashboard/marketplace` — operational store management:

- Connected stores list with status badges
- Token health indicators
- Reconnect modal for expired accounts
- Attention banner for stores needing action

Not a customer-facing storefront.
