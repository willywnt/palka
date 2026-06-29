# Palka — Project Rules (read fully every session)

Modular-monolith, pnpm@9 + Turborepo, Node ≥20. Edit code to match surrounding
style. These rules are derived from the actual refactored code — keep them true.

## 1. Stack

- **apps/web** — Next.js 15 App Router + React 19. Custom Node server
  `apps/web/server.ts` (run via `tsx watch server.ts`) attaches Socket.IO; dev compilation
  uses **Turbopack** (`next({ dev, …, turbopack: dev })` — gated on `dev`, so prod `tsx server.ts`
  stays webpack) to avoid laggy first-navigation route compiles. `dev:next` (`next dev --turbopack`)
  is a Turbopack-without-socket fallback for pure-UI work.
  Prod runs the **custom server** (`tsx server.ts`) on the **self-hosted VPS via Coolify** (LIVE at
  `app.trypalka.com` since 2026-06-28), so marketplace sync / scheduled jobs / scanner socket are
  **active in prod**. Self-hosted Docker runs the custom server + worker; see `docs/deployment`.
- **apps/worker** — BullMQ background jobs.
- **packages/** = shared `@palka/*`: `db` (Prisma+schema), `config` (env+limits),
  `logger`, `types`, `utils`, `metrics`, `health`, `queue`, `storage`, `rate-limit`,
  `redis`, `ui`, `eslint-config`, `typescript-config`.
- Server state → **TanStack Query v5**. UI state → **Zustand v5**.
  Auth → Auth.js (next-auth 5 beta, JWT). DB → Prisma+Postgres.
  Files → Cloudflare R2 (S3 SDK, presigned). Tests → Vitest (unit/integration, Prisma mocked)
  - Playwright (E2E, `apps/web/e2e`, Phase-1 local). Because unit tests mock Prisma, DB/runtime
    regressions (e.g. a bad `$queryRaw`) need the E2E or a real-DB probe, not just `pnpm test`.

## 2. TypeScript (packages/typescript-config/base.json → nextjs.json)

`strict`, `moduleResolution: bundler`, `module: ESNext`, `target: ES2022`,
`isolatedModules`, **`noUncheckedIndexedAccess`**, **`noImplicitOverride`**,
**`verbatimModuleSyntax`**, `esModuleInterop`, `forceConsistentCasingInFileNames`.
web: `noEmit`, `jsx: preserve`, `allowJs`, next plugin. Alias **`@/*` → `apps/web/src/*`**.

- `verbatimModuleSyntax` → type-only imports MUST use `import type { X }`.
- `noUncheckedIndexedAccess` → indexed access is `T | undefined`; guard it.
- ES2022 + `useDefineForClassFields`: a `DomainError` subclass narrows its code with
  `declare readonly code: XErrorCode` (NOT a real field, NOT `declare override`).

## 3. Module boundaries (apps/web/src/modules/<feature>/)

Modules: `admin audit auth catalog finance inventory marketplace notifications orders purchasing recordings reporting returns sales scanner-pairing storage users`.

- A module owns its feature. Talk to another module ONLY through its conventional
  layer files (`services/`, `hooks/`, `validators/`, `types/`) — never reach into
  another module's deep internals.
- Cross-cutting/shared logic lives in `@palka/*` packages or `apps/web/src/lib` —
  never duplicated per module.
- A submodule (e.g. `recordings/recovery/`, has its own `index.ts`) is internal to
  its parent domain; outside code goes through the parent.
- **CONFLICT RULE: preserve the boundary over removing duplication.** If dedup would
  force a boundary-breaking cross-import, keep the duplication (or lift to `@palka/*`)
  and flag it as a separate suggestion.

## 4. Folder & naming per module (real structure)

`components/` UI `.tsx` · `hooks/` React+TanStack hooks & `*-keys.ts` query keys ·
`services/` business logic `*.service.ts` (server svc start with `import 'server-only'`) ·
`repositories/` Prisma access `*.repository.ts` (where present) · `validators/` Zod
`*.ts` (+`index.ts` barrel) · `types/` · `errors/` classes extending `DomainError` ·
`store/` Zustand `*.store.ts` · `utils/` pure helpers · `actions/` server actions ·
`socket/` event contracts (scanner-pairing) · `config.ts`.
Files kebab-case. **Shared non-module:** `src/lib` (api infra, errors, logger, env),
`src/components` (shared UI/providers), `src/hooks`, `src/store` (app UI stores),
`src/app/**/route.ts` (Route Handlers), `packages/*`.

## 5. Layering — what each layer MAY / MUST NOT do

| Layer                                   | MAY                                                                                         | MUST NOT                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------- |
| **UI** `components/`                    | render, local interaction, read TanStack/Zustand                                            | fetch, Prisma, business rules       |
| **Hooks** `hooks/`                      | useQuery/useMutation, query keys, invalidation, call fetch-client                           | business rules, Prisma              |
| **Route Handler** `app/api/**/route.ts` | `withApiRoute`, Zod-parse input, call ONE service, return `apiSuccess`/`apiValidationError` | business logic, Prisma, manual auth |
| **Service** `services/*.service.ts`     | business logic, throw module errors                                                         | import `next/server`, touch HTTP    |
| **Repository / data**                   | Prisma queries (`@palka/db`)                                                                | leak Prisma types past the module   |
| **Validators** `validators/`            | Zod schema = single input source; `z.infer` types                                           | —                                   |

Prisma belongs in the data layer — a `repository` where one exists (scanner-pairing),
otherwise the server service. NEVER in a Route Handler or UI.

## 6. State rules

- **Server state (anything from DB/API) → TanStack Query ONLY.** Query keys live in
  `*-keys.ts` as one hierarchy (e.g. `recordingKeys.all/.active/.list(q)/.detail(id)`);
  refresh via `queryClient.invalidateQueries`.
- **Zustand → ONLY client/UI state**: modal open, countdown, filters, sidebar/nav,
  media-stream + recording-lifecycle UI. (`ui-store`, `scanner-pairing.store`, `recording.store`.)
- **HARD: never put server/fetched entities in Zustand.** The pairing session was moved
  OUT of Zustand into the Query cache — keep it there.

## 7. Patterns (copy these — from real code)

**Route Handler (orchestration only):**

```ts
const querySchema = z.object({ noResi: z.string().trim().min(1).max(64) });
export const GET = withApiRoute(
  async (request, { user }) => {
    const parsed = querySchema.safeParse({
      noResi: new URL(request.url).searchParams.get('noResi') ?? '',
    });
    if (!parsed.success) return apiValidationError(parsed.error);
    const data = await recordingServerService.findRecentDuplicateResi(user.id, parsed.data.noResi);
    return apiSuccess(data);
  },
  { requireAuth: true },
);
```

`withApiRoute` handles auth/admin (XOR), rate-limit, request-id, and central error
mapping; the handler gets a guaranteed-non-null `{ user, requestId }`.

**Errors:** throw a module error extending `DomainError(code, message, statusCode, details?)`.
`handleApiError` maps ANY `DomainError` generically (code+statusCode) — the shared layer
imports no modules. Client: `apiFetch` → `ApiResult<T>` (unwraps the `{ data }` envelope; a
legitimately-null `data` STAYS null — never fall back to the whole payload); `apiFetchOrThrow`
throws a `DomainError` **preserving the server code** (never collapse to `UNKNOWN`).

**Session expiry:** a `401` from ANY route = session gone. `apiFetch` fires `onUnauthorized`
listeners (registry in `lib/api/fetch-client.ts`) → `SessionExpiryWatcher` (mounted in
`Providers`) hard-redirects to `/login?callbackUrl=<current url>`, so re-login returns the
user where they were. Reuse this — never add ad-hoc per-call 401 redirects. (Route gating for
unauthenticated users + the same `callbackUrl` round-trip already live in `middleware.ts` +
`authConfig.authorized` — HARD CONSTRAINT #2, don't duplicate.)

**Data fetching (hook):**

```ts
const result = await apiFetch<StartRecordingResponse>(`${apiRoutes.recordings}/start`, {
  method: 'POST',
  body: { noResi },
});
if (!result.success) throw new Error(formatApiErrorMessage(result.error));
// onSuccess: queryClient.invalidateQueries({ queryKey: recordingKeys.active })
```

**Logging:** `appLogger`/`logger` from `@palka/logger`; structured `('event.name', { ctx })`.
Never `console.log`; never log secrets (errors go through `sanitizeError`).

**R2 presigned upload:** client → `POST /api/v1/uploads/presign` →
`uploadService.createPresignedUpload` (quota check → `storageService.generateUploadUrl`,
R2 signs **content-type only**) → browser `PUT`s the file straight to R2 →
`POST /api/v1/recordings` saves metadata. The server never proxies file bytes.

## 8. HARD CONSTRAINTS — confirm BEFORE touching

1. **Prisma schema & migrations** — `packages/db/prisma/schema.prisma`.
2. **Auth.js config** — `auth.config.ts`, `auth.ts`, `middleware.ts`, cookie options.
3. **Env var names/values** — see `turbo.json` globalEnv + `.env`. Shopee/Tokopedia adapters are
   env-gated (unset ⇒ Dev-stub fallback): `SHOPEE_PARTNER_ID`/`_PARTNER_KEY`/`_API_BASE_URL`/
   `_OAUTH_REDIRECT_URI`, `TOKOPEDIA_APP_KEY`/`_APP_SECRET`/`_SERVICE_ID`/`_API_BASE_URL`/`_OAUTH_REDIRECT_URI`.
4. **Socket.IO event contracts** — `scanner-pairing/socket/events.ts`:
   `pairing_connected`, `pairing_disconnected`, `barcode_scanned`, `barcode_ack`,
   `recording_triggered`, `station_recording_state`, `scanner_heartbeat`,
   `session_state`, `pairing_error`. Don't rename/repurpose payloads.
5. **Behavior of the 2 happy flows** — refactor structure freely, but behavior must not change.
6. **Organization scope** — domain data is scoped by `organizationId` (NOT `userId`); `userId`
   on a domain row is the **actor/creator**. Services take `organizationId` first (+ `actorUserId`
   for writers, persisting both). `withApiRoute` hands handlers `{ user, org }` and re-validates
   membership per request; gate elevated routes with `requirePermission` (configurable per org) or
   `minOrgRole` (owner-only). Don't reintroduce `userId` scoping. Detail:
   `.cursor/rules/10-api-and-data.mdc` + `docs/roadmap/org-foundation.md`.

## 8a. Organization, roles & team (multi-user per shop)

- **Models**: `Organization` (owns the shop's data + storage quota), `OrganizationMember`
  (one per user in v1: `@@unique([userId])`), `OrganizationInvite` (single-use code). `OrgRole`
  = `OWNER | ADMIN | STAFF` (separate from platform `UserRole ADMIN|USER`). Backfill identity:
  for pre-org accounts `Organization.id == owner User.id` (keeps R2 keys + code sequences valid).
- **Auth**: sign-in (credentials + pairing QR) resolves membership; no active membership ⇒ login
  refused (`AuthError.accessRevoked`). JWT carries `organizationId`/`orgRole` as a HINT; the DB is
  authoritative (re-resolved per request).
- **RBAC is per-org CONFIGURABLE** (server = boundary, UI hiding cosmetic). A catalog of 13
  permission keys (`modules/users/permissions/catalog.ts`) in two tiers: **VIEW keys**
  (`reports.view`, `purchasing.view`, `marketplace.view`, `finance.view`) hide a whole section — nav
  menu + pages + create entries + deep-link buttons — when off; **ACTION keys** (`sales.refund`,
  `purchasing.cancel`, `catalog.delete`, `catalog.import`, `inventory.adjust`, `opname.post`,
  `marketplace.manage`, `team.manage`, `finance.manage`) hide a single button. The OWNER edits an ADMIN/STAFF allow-matrix in Settings →
  "Peran & akses". OWNER always has all keys; **defaults = ADMIN all on, STAFF all off** (STAFF is
  pure daily-ops: Kasir/Pesanan/Inventaris/Opname-count/Katalog/Rekam/Retur — no reports,
  purchasing, marketplace, or money/config). Stored in `Organization.permissions` (Json, null =
  defaults), resolved per request into `org.permissions` by `resolveOrgContext`. Gate routes with
  **`requirePermission: '<key>'`** (OWNER bypasses) + pages with `requireOrgPermission`; reserve
  **`minOrgRole: 'OWNER'`** for owner-only (member role-change/remove, the matrix editor, **store
  rename** `PATCH /api/v1/org`). Client mirrors it with `useHasPermission(key)` + nav `permission`
  (NOT role checks). Team authority stays **hybrid**: ADMIN (with `team.manage`) lists members +
  mints/revokes STAFF invites; OWNER additionally changes roles, removes members, mints ADMIN
  invites; the OWNER row is immutable. Settings: Penyimpanan is visible to ALL roles (read-only
  quota); Tim/Riwayat = ADMIN+; Peran & akses = OWNER only.
- **Invites**: 8-char code (`A-Z2-9`, no 0/O/1/I), 7-day expiry, shared via WhatsApp; subject to
  the org's `memberLimit` (`assertMemberCapacity`: members + pending invites < limit; null =
  unlimited). **Registration is invite-only** — `inviteCode` is REQUIRED; `registerUser` claims it
  atomically in the register tx (joins the org with the invite's role). New organizations are NOT
  self-served: they're provisioned by the admin-ops console.
- **Platform admin-ops** (`app/(admin)/admin`, gated by `requirePlatformAdmin` = `UserRole.ADMIN`,
  its OWN minimal chrome): provisions new orgs + their OWNER account (typed initial password), and
  edits per-org config — `plan` (subscription label) + `memberLimit` + storage quota — the hooks a
  real plan tier reads. Routes under `/api/v1/admin/organizations` (`requireAdmin`). Billing is a
  labeled placeholder. **A platform-admin is confined to `/admin`**: login routes there and the
  `authorized` callback + `(dashboard)` layout bounce them out of the shop entirely (so the seed
  `admin@palka.local` never uses a shop dashboard — it's a pure operator account).
- **Audit**: `auditService.log` writes best-effort AFTER each sensitive tx; Settings → Riwayat
  aktivitas (ADMIN+) lists it.

## 9. Quality gate — green after EVERY change

`pnpm typecheck` · `pnpm lint` (`eslint . --max-warnings 0`) · `pnpm build` ·
`pnpm test` (vitest). **No `any`. No unused. No duplication. No oversized
multi-responsibility files.** pre-commit (husky+lint-staged) runs eslint --fix +
prettier. Repo line-endings = **LF**. CI (`.github/workflows/ci.yml`) re-runs the
four gates (build→typecheck→lint→test, build first so typedRoutes types exist) on
push/PR to main. **E2E** (`pnpm --filter @palka/web test:e2e`, Playwright) is NOT
in the gate — run it locally against `pnpm dev` + the demo seed (`pnpm db:seed-demo`).

## 10. Anti-patterns (reject these)

Over-engineering · server state in Zustand · business logic/Prisma in a Route Handler
or UI · cross-module deep imports · multi-responsibility/oversized files · swallowing
errors or collapsing codes to `UNKNOWN` · `console.log` over `logger` · "fixing" the
socket by forcing `transports: ['websocket']` (see scanner rules — it is NOT a fix).

## 11. Workflow

**ALWAYS branch off `main` before writing code — NEVER commit on `main`.** Solo dev: use
**ONE branch per SESSION** (not per feature — keep branch count low); branch name is loose,
but **commits must be clear and per-action**. · Analyze & explain before changing · work
incrementally **per-module** · **one logical commit per change** · keep all gates green at
every commit · report potential bug/security/race/perf as **separate suggestions** (don't
silently change) · when unsure between approaches, **ASK** — boundary beats dedup.

## 12. Inventory / Marketplace MVP (catalog · inventory · marketplace · orders · returns · sales/POS · purchasing · order-aware recordings)

Internal inventory = **source of truth**, integrated with marketplaces (adapter-first; **LAZADA is a
REAL, OAuth-onboarded, live-validated adapter**; **SHOPEE + TOKOPEDIA are env-gated real adapters —
SCAFFOLDED 2026-06-17, NOT yet live-verified** (need sandbox creds; fall back to the Dev/stub when app
creds are unset). **TOKOPEDIA runs on the TikTok Shop Open API v202309** — the standalone
developer.tokopedia.com API is terminated. `docs/roadmap/shopee-tokopedia-integration.md`). Detail:
`.cursor/rules/40-inventory-marketplace.mdc` (Lazada OAuth section) + `docs/roadmap/inventory-mvp.md`.

- **`StockLedger` (append-only, available-centric) is the truth; `Inventory` is a fast-read cache**
  (available/reserved/damaged/incoming) — every stock change = 1 ledger row + 1 Inventory update in
  one tx, **serialized per variant by a transaction advisory lock** (`lockAndReadInventory` →
  `pg_advisory_xact_lock(hashtext(variantId))`, taken via **`$executeRaw`** — NOT `$queryRaw`: the
  lock returns `void`, which `$queryRaw` can't deserialize). This closes the read-compute-write
  lost-update race on the absolute `availableStock`/`balanceAfter` write. The `inventory` module owns
  ALL stock writes; `catalog` (Product/Variant) reaches stock ONLY via the inventory service. POS
  void/refund serialize the same way with a **per-sale** advisory lock + in-tx re-validation.
- **Catalog variants / subvariants** (`catalog`): the **variant is the SKU/stock leaf** (unchanged);
  **`ProductVariant.variantGroup String?`** is an optional grouping **label** — a variant is either a
  **standalone SKU** or a **named group of subvariant SKUs** (siblings share one `variantGroup`). A product
  may have **0..N** variants (create-without-variant, add later from detail). Grouping is **display-only** —
  inventory/ledger/orders/sales/PO/marketplace stay at the leaf, **no deeper stock level**. Shared builder
  `variant-blocks-field.tsx`; SKU auto-gen; **soft-delete frees the SKU** (`archivedSku` mangles
  `<sku>::deleted::<id>`; `unarchiveSku` reverses it) and is gated by a cross-module **delete preflight**
  `getDeletionBlockers` (marketplace-mapped / reserved / incoming / open-PENDING-return = **block**;
  on-hand + damaged + **bundle membership** = **warn**). **Archived variants are restorable**: product
  detail has a collapsible **"Varian terarsip"** section (`listArchivedVariants`/`restoreVariant`,
  `GET …/variants/archived` + `POST …/variants/:id/restore`) — restore reinstates the original SKU and is
  **refused (block, not auto-suffix)** when a live variant/bundle now owns it (`takenSkus` checks both;
  unique index is the final race guard). **Per-variant photo**
  (`imageKey`/`imageUrl`) lives in a **separate PUBLIC R2 bucket** (recordings bucket stays private),
  client-compressed to WebP, shown in a `VariantImage` popover by the name. R2 uses **per-bucket public
  URLs** (`<base>/<key>`, NO bucket in the path): `R2_RECORDINGS_BUCKET_NAME`+`R2_PUBLIC_URL`,
  `R2_PRODUCTS_BUCKET_NAME`+`R2_PRODUCTS_PUBLIC_URL`.
- **Bulk product import/export (XLSX-only)** (`catalog`, no schema change) on the Produk dashboard:
  **export** (ungated) downloads an .xlsx, one row per live variant (`listForExport`→`buildProductsXlsx`,
  SheetJS `xlsx`); **import** (gated `catalog.import`) is a **two-modal** wizard — a compact upload modal
  (draggable .xlsx dropzone + a centered "Unduh template" link; the header-only template marks required
  columns as `Nama Produk*`) and a separate **wide editable preview** (per-cell errors, "auto" badge on
  generated SKUs, inline row edit + delete, "Unggah ulang", summary tooltips). Upsert by **exact SKU**
  (unknown/blank → CREATE, grouped by product name → existing/new/ambiguous; matched → `updateVariantDetails`
  for name/group/barcode/price/cost — SKU never changes). **Stock seeds NEW variants only** (via
  `initialStock` → inventory service); a stock cell on an existing SKU is ignored. The wizard plans/re-plans
  edits **on the client** (`planProductImport` is pure; existing data via `POST /products/import/resolve`);
  the client parses .xlsx (lazy `import('xlsx')`) and only the final commit is authoritative.
  `planProductImport` returns per-field errors + `skuGenerated` + `resolvedSku`, and flags **duplicate
  effective SKUs** (typed or generated) as errors. The preview virtualizes
  (`components/virtualized-table.tsx`, `@tanstack/react-virtual`, opt-in) and **commits in sequential
  100-row chunks with a progress bar**; partial failures are safe to re-run because the import is
  **idempotent** (created→update by SKU on retry). Large-file/BullMQ path (VPS era) is prepared in
  `docs/roadmap/product-import-scaling.md`. Detail: `docs/roadmap/backlog.md` (2026-06-20).
- **In-detail product editing**: the product detail page has an **"Edit"** toggle that flips the SAME layout
  into **inline inputs** (text→input in place; no separate form): product name (header) + category/description
  (aside), each variant/subvariant name, **harga, modal** (a Modal column was added to the variant table), and
  the **group name**; in edit mode only the editable columns show (Tersedia/Koneksi/Aksi hide). Save
  diff-then-PATCHes only changes via `updateProduct` + the now-exposed
  `updateVariantDetails` (`PATCH /products/[id]/variants/[variantId]/details`), behind a confirm. **SKU stays
  read-only** (barcode isn't edited here); stock via "Sesuaikan"; reorder-planning via the ⋯ **"Ubah informasi
  tambahan"** action (the old "Ubah varian" — an `EditVariantDialog` that edits planning fields only, distinct
  from the inline core-field editor).
- **Outbound sync** lives in `packages/queue/src/marketplace-sync` (worker): a SoT change enqueues
  `propagate-inventory-stock` → `sync-marketplace-stock` → provider adapter (Dev stub simulates).
  **AUTO changes are COALESCED** per `(org, variant)` — a stable BullMQ jobId + 60s delay
  (`MARKETPLACE_SYNC_COALESCE_WINDOW_MS`) collapse a burst into one push of the LATEST available;
  **manual syncs stay immediate**. Stock-write is an **absolute set**. Next lever (multi-SKU-per-call
  batching) = `docs/roadmap/sync-batching.md` (Approach B, not started). **Lazada multi-warehouse is
  NON-DESTRUCTIVE** — per-connection `syncWarehouseCode` writes ONLY that warehouse and OMITS the rest
  (Lazada leaves them untouched); never zeroes a warehouse we don't own; drift compares the sync
  warehouse's own sellable. The internal multi-location/WMS generalization is scoped (not built) in
  `docs/roadmap/wms-scoping.md`. A CONFIRMED mapping auto-enables `syncEnabled` (NEEDS_REVIEW stays off).
  Full detail: `.cursor/rules/40-inventory-marketplace.mdc`.
- **Phase 6 — provider-health + drift reconciliation + token auto-refresh** (shipped 2026-06-15,
  zero-migration, **observe-only**): per-connection health computed on-read (`marketplaceHealthService` →
  ok/warn/danger) drives a "Kesehatan & drift" panel + dashboard badges + a `marketplaceUnhealthy` nav
  pulse; `computeStockDrift` (pure, in `@palka/queue`, shared by web + worker) compares a live external
  pull vs internal `available` (over/under/missing) for an on-demand `POST /[id]/drift-check`
  (marketplace.manage; health reads = marketplace.view) and a daily worker job — internal stays the SoT,
  drift is only surfaced (fix = manual re-push). A daily `refresh-marketplace-tokens` worker + a lazy
  refresh-before-use in the sync engine (`ensureFreshAccessToken`) renew tokens nearing expiry for
  **LAZADA + SHOPEE + TOKOPEDIA** (`findConnectionsForTokenRefresh`; Shopee's ~4h token makes lazy refresh
  load-bearing). Detail: `.cursor/rules/40-inventory-marketplace.mdc` (Phase 6 section).
- **Inbound order stock lifecycle** (each stage once, idempotent via `Order.inventoryAppliedAt`/
  `inventoryShippedAt`/`inventoryRevertedAt`): RESERVE on PAID (`available−`, `reserved+`) → SHIP on
  SHIPPED/COMPLETED (consume reservation, `reserved−`, available unchanged) → RELEASE on
  cancel-**before**-ship (`available+`, `reserved−`); cancel-**after**-ship is a **return**, not a
  release. Only available changes (reserve/release) propagate, **excluding the source channel**.
- **Returns/RMA** (`returns` module): a return opens (auto on post-ship cancel, or manual) → processed
  per line to RESTOCK (`available+`) or DAMAGED (`damagedStock+`); ledger reason `RETURN`. Stock moves
  only at processing, via the inventory service — never over-credit.
- **Fulfillment (Phase 5)**: orders ↔ packing videos (recordings) join by **`noResi`** (no FK,
  **case-insensitive**). A completed packing video best-effort stamps `Order.fulfilledAt`; the
  recording **station shows a pack view** (the matched order's items), and orders/returns show the
  packing video as **dispute evidence**. Links work both ways. A read-only **packing departure
  board** (`/dashboard/orders/board`, standard table dress + back button) polls PAID/SHIPPED every
  20s via `useOrdersBoardQuery` — **no socket** (contracts untouched); the route is
  shell-suppressed. Orders list rows open a read-only **peek Sheet** (`order-peek.tsx`).
- **Offline sales / POS** (`sales` module — `Sale`/`SaleItem`, `SalePaymentMethod` CASH/QRIS/TRANSFER,
  `SaleStatus` COMPLETED/VOID/**PARTIALLY_REFUNDED**): a counter sale **decrements the SoT immediately**
  (`available−`, ledger reason `SALE` / source `POS`, ref = saleId) in one tx, then propagates to **all**
  channels (selling in-store can't oversell online). Oversell is allowed — goods are in hand. Code
  `S00001` per-user. Velocity counts `SALE` too (`SALES_LEDGER_REASONS` =
  `ORDER_RESERVE`+`ORDER_RELEASE`+`RETURN`+`SALE`).
  - **Discount + PPN**: a sale carries `subtotalAmount`/`discountAmount`/`taxRate`/`taxAmount`/
    `taxInclusive`; `SaleItem.discountAmount` is the cart discount allocated per line. The math lives in
    ONE shared pure util `modules/sales/utils/sale-totals.ts` (`computeSaleTotals` + `allocateProportionally`),
    used by BOTH the POS preview and the server so they agree to the rupiah. **Net revenue = `totalAmount −
taxAmount` in BOTH modes** (exclusive PPN adds on top; inclusive PPN is carved out, total unchanged);
    the profit report reads POS lines at their effective NET unit so omzet/margin are net.
  - **Refund** (`SaleRefund`/`SaleRefundItem`, code `RF00001` per-user): per-item/qty refund (not just
    all-or-nothing VOID) → restocks via `applyOfflineSaleReversalTx` per qty (ledger note `Refund RF…`),
    flips status to `PARTIALLY_REFUNDED`; cash valued at the line's NET unit (`refundLineAmount`). **VOID
    is refused once a refund exists** (it would double-restock). Refunds enter the profit report as
    negative-qty net lines (revenue + COGS reverse) at refund time. **Receipt (struk)**: 58mm printable
    via the shared `[data-print-root]` isolation on sale detail; CASH checkout has a kembalian calculator
    **with quick-tender buttons** (Uang pas + the smallest covering notes). POS extras: **pinned
    favorites** (`store/pos-favorites.store.ts`, ids-only UI state, capped 12) render a "Favorit"
    quick-add strip while search is empty; desktop shortcuts `/` (focus search) and `F8` (jump to pay);
    **held / park sale** (`store/pos-held-sales.store.ts`, Zustand+persist, per-browser DRAFT capped 20)
    — "Tahan" sets the cart aside, the "Tertahan" tray resumes it (lines/customer/discount/PPN restored;
    resuming an active cart parks it first). Client-side only (single-register scope).
- **Purchasing / restock** (`purchasing` module — `PurchaseOrder`/`PurchaseOrderItem`,
  `PurchaseOrderStatus` DRAFT→ORDERED→PARTIALLY_RECEIVED→RECEIVED/CANCELLED): lights up the **`incomingStock`**
  bucket. A PO can be saved as a **DRAFT** first (`createPurchaseOrder` with `status:'DRAFT'`) — it reserves
  **NO** incoming, is freely **edited** (`updatePurchaseOrder`, replaces supplier/note/lines wholesale),
  then **placed** (`placePurchaseOrder` DRAFT→ORDERED, stamps `orderedAt`) or permanently **discarded**
  (`discardDraftPurchaseOrder`, hard delete) — all three are **DRAFT-only**. Placing (or creating ORDERED
  directly) → `adjustIncomingTx(+qty)` per line (forecast bucket, **no ledger row**, available unchanged).
  **Receive** (partial per-line, clamped to outstanding) → `applyPurchaseReceiveTx` (`incoming−`,
  `available+`, ledger `RESTOCK` / source `PURCHASE`), recompute status, propagate to all channels.
  **Cancel** (pre-receive, ORDERED/PARTIALLY) → `adjustIncomingTx(−outstanding)`. A PO can link a saved
  **`Supplier`** (`PurchaseOrder.supplierId`, FK SetNull) via a typeahead on New-PO; `supplierName` is
  kept as a denormalized snapshot (free-text still allowed). Variant `cost` **auto-updates to the
  moving-average HPP on receive** (`computeMovingAverageCost`, inventory service). Code
  `PO00001` per-user. The reorder report's
  **"Create PO"** prefills the form from URGENT/SOON suggestions (its `suggestedReorderQty` already nets
  `incoming`, so a PO immediately corrects the suggestion).
- **Bundles / kits (`catalog` — `Bundle`/`BundleItem`) = a SHORTCUT, NOT a stock variant.** A bundle groups
  several variants for buy/sell (own sku/barcode/price/image/`isActive`/`labelPrintedAt`); it holds NO stock and
  never appears in product/inventory lists. Sell (POS) / buy (PO) **explode it into per-component `SaleItem`/
  `PurchaseOrderItem` rows at create** (`qty × perBundleQty`, tagged `bundleName`), so receive/void/incoming/
  propagate reuse the per-row paths unchanged; the single bundle price/cost is **allocated proportionally** to
  components (`allocateBundleUnitAmounts`, integer cents, unit-tested) keeping per-variant revenue/COGS correct.
  `available` = `computeBuildableQty` (min over components). POS + New-PO have a Products/**Bundling** tab; POS
  oversell warnings **accumulate per variant**; scan resolves variant-OR-bundle (`resolveBundleByCode`); SKU is
  unique across bundles **and** variants; **inactive** bundles are hidden from POS/PO/scan. Bundle QR labels =
  labels-studio "Bundles" tab. Bundle logic lives in the catalog module's **`bundle-server.service.ts`**
  (`bundleServerService`: `resolveBundles`/CRUD/image/labels + `cascadeBundleComponentRemoval(tx,…)`);
  sales/purchasing import `bundleServerService`, never the tables. Shared SKU/storage/Prisma-error
  helpers live in `catalog/utils` (`sku.ts`/`storage.ts`/`prisma-errors.ts`) so neither catalog- nor
  bundle-service reaches into the other. Marketplace orders NOT bundle-aware (deferred). **Bundles soft-delete**
  (`Bundle.deletedAt`): manual delete **archives** (frees the SKU like a variant, keeps composition+image,
  restorable) and every bundle read filters `deletedAt: null`; a **"Bundel terarsip"** view on the bundles
  dashboard restores (`listArchivedBundles`/`restoreBundle`, same SKU-reclaim + block-on-clash rule as
  variants). **Deleting a variant cascades into bundles**: the delete preflight warns which bundles list it,
  then `cascadeBundleComponentRemoval` (inside the deleteVariants + deleteProduct tx) drops its `BundleItem`
  from every LIVE bundle and **auto-archives any bundle left with 0 components** (archived bundles keep their
  items so a restore stays intact; a 0-component restored bundle is re-filled on the edit screen).
  Detail: `…/40-inventory-marketplace.mdc`.
- **Reorder + activity**: reorder report (velocity → days-of-cover → suggested qty; effective lead
  time/MOQ resolve **variant value → preferred-supplier default (`ProductVariant.supplierId`) →
  global** — variant wins, soft-deleted suppliers ignored); stock activity log (filter + paginate +
  CSV); variant editing. Demand
  velocity sums `ORDER_RESERVE`+`ORDER_RELEASE`+`RETURN` (net), excludes the delta-0 `ORDER_SHIP`.
  The inventory table surfaces a per-row **days-of-cover gauge** (reorder report joined client-side,
  enhancement-only) + a **"Buat PO"** row action → `/dashboard/purchasing/new?variant=<id>` (PoForm
  appends that line from its reorder suggestions, ref-guarded one-shot).
- **Stock opname / cycle count** (`inventory`): `StockOpname`/`StockOpnameItem` + `StockOpnameStatus`
  (DRAFT/COMPLETED/CANCELLED), code `OP00001` per-user. A session at `/dashboard/inventory/opname`: add
  lines (system qty snapshotted ONCE at add) via search-to-add or **scan-to-count** (a phone on an
  **`OPNAME`** pairing — each scan **tallies +1**; `scanCountItem` resolves barcode/SKU + increments
  atomically), edit the counted qty inline (a `= sistem` shortcut + live variance), then **post** → every
  line's variance writes a `RECONCILE`/source `MANUAL` ledger row via the new
  `inventoryServerService.applyReconcileTx` and corrects the Inventory cache (then propagates), or cancel.
  **No new ledger reason** (`RECONCILE` already existed). Posted/cancelled = read-only variance report.
  The opname list takes `?search=` (code/note contains, case-insensitive) end-to-end (validator →
  service where → hook key → URL-synced search box).
- **Reporting** (`reporting` module, read-only, under "Insights"): profit/margin, per-channel performance,
  inventory valuation, and **dead-stock & ABC**. Dead-stock = in-stock variants idle ≥ N days (REAL
  days-since-last-sale from the `SALE`/`ORDER_RESERVE` ledger) valued at moving-avg cost; ABC = Pareto by
  net revenue (A/B/C over positive revenue). Pure aggregates (unit-tested) + CSV export; the sales reports
  reuse `loadSoldLines` so processed returns net out.
- **Keuangan / True Net P&L** (`finance` module + a `reporting` report): an org-scoped, soft-deleted
  `Expense` ledger (`ExpenseCategory` enum: advertising/packaging/shipping-subsidy/salary/rent/
  marketplace-commission/payment-fee/utilities/other) at `/dashboard/finance/expenses` (nav "Keuangan",
  CRUD gated `finance.manage`), and a **"Laba bersih (Net P&L)"** report under Laporan at
  `/dashboard/reports/net-profit` (gated `finance.view`): `getNetProfitReport` reuses `getProfitReport`
  (revenue−COGS) and subtracts `expenseServerService.listExpenseLines` over the same range via the pure
  `aggregateNetProfit` util (same `money()` rounding → reconciles) → **net profit = gross profit − Σ
  opex**, with per-category + per-period breakdowns. OWNER/ADMIN only (STAFF never sees money). The
  Pengeluaran page also has a date/category **filter + CSV export**, and the dashboard home shows a
  `finance.view`-gated **"Laba bersih bulan ini"** mini-card. **Recurring opex** = `ExpenseTemplate`
  (sewa/gaji; a monthly DEFINITION, not a ledger row) + **"Buat bulan ini"** `generateForMonth` that
  materializes active templates into `Expense` rows, **idempotent** via `Expense.templateId`+`periodMonth`
  and a PARTIAL unique index (one live generated expense per template/month; manual rows excluded) — see
  the schema comment + migration `20260627090000`; auto-gen on the 1st is VPS-era. **Auto-derived fees**
  (estimate-grade, NOT provider-reported): `Organization.qrisFeeRate` + `MarketplaceConnection.commissionRate`
  (Decimal(5,2) percent) feed a "Fee otomatis" panel + **"Hitung fee bulan ini"** (`feeServerService.
deriveFeesForMonth`) → QRIS fee = gross QRIS sales × rate, commission = fulfilled order revenue per
  connection (`inventoryShippedAt`-dated) × rate, each UPSERTed as an `Expense` (PAYMENT_FEE /
  MARKETPLACE_COMMISSION) keyed by `Expense.autoSourceKey` + a 2nd partial unique index (migration
  `20260627100000`); commission rates write through `marketplaceServerService.updateCommissionRate`.
  The ledger flags each row's **`source`** (MANUAL/RECURRING/AUTO_FEE, from templateId/autoSourceKey) as a
  "Berulang"/"Otomatis" badge + CSV "Sumber" column. **Budget vs actual**: a `Budget` model (one monthly
  budget per category, `@@unique([organizationId, category])`, set once) + an "Anggaran vs realisasi"
  current-month card on the Net P&L page (`budgetServerService.getBudgetReport` joins budgets with
  `expenseServerService.sumByCategoryForRange`; over-budget first + usage bars; "Atur anggaran" gated
  finance.manage, amount 0 unsets; migration `20260627110000`). Shared `finance/utils/period` holds
  `monthBounds`/`round2`. Deferred: expense→order ref · schedule the fee derive on the VPS worker.
- **Mapping / pull**: mapping is 1:1 per LISTING but a variant MAY map to many listings (cross-channel
  — do NOT force 1:1). Auto-map is NORMALIZED sku, NEVER edit-distance (`…-M` ≠ `…-L`); non-exact →
  `NEEDS_REVIEW`, sync stays off. `resolveOrderItem` maps an unmapped item (`mapByExternalRef`).
  **Multi-store pull** `pullFromConnections(org, actor, { connectionIds?, full? })` (default all active,
  per-provider cooldown). **Order pull is REAL for LAZADA** (`LazadaOrderAdapter`; Shopee/Tokopedia still
  stub). Incremental cursor `MarketplaceConnection.ordersSyncedThrough` (decoupled from the cooldown),
  advanced ONLY on a COMPLETE pull (adapter → `{ orders, complete }`); `full:true` re-syncs the whole
  window. **INVARIANT: a reserved order's line set is FROZEN** (carry qty/variant/`unitCost` forward +
  reserve-delta for late maps; ship/release run off the frozen set). Per-line status releases a line
  cancelled inside a shipped order. VPS auto-pull (`runScheduledPull` + `server.ts` timer + internal
  endpoint, env `ORDERS_AUTO_PULL_INTERVAL_MS`, runs on the VPS custom server). Design + open issues (Batch-3
  secret+rate-limit hardening DONE 2026-06-29 via `INTERNAL_API_SECRET`; auto-pull enable owed): `docs/roadmap/lazada-order-pull.md`. Provider creds thread as
  **`ProviderShopCredentials = {accessToken, shopId, shopCipher}`** (Lazada ignores shopId/shopCipher;
  Shopee uses shopId; Tokopedia/TikTok needs `MarketplaceConnection.externalShopCipher`).
- **UI cross-module**: import another module's hooks/types, NOT its components — compose at the app
  layer (page). **Dev data**: `pnpm db:reset-demo` resets the demo orders/returns/sales/stock to re-test
  the loop (then restart the dev server to rewind the stub pull timeline). `pnpm --filter @palka/db
db:seed-demo` (flags `--fresh`/`SEED_FRESH=1`) seeds the full demo org "Toko Palka Demo" +
  OWNER/ADMIN/STAFF logins (owner@/admin@/staff@palka.demo) with data across every feature.
- **QR-scan (POS phase 2) — ✅ shipped.** Per-SKU **QR labels**: a label studio at `/dashboard/labels`
  (catalog) prints an A4 grid encoding `barcode ?? sku` (`listLabelVariants` paginated, already-printed
  sort last). **`ProductVariant.labelPrintedAt`** records the last print (`markLabelsPrinted`) — surfaced
  in the labels picker + a shared **`QrCodeDialog`** on the product-detail (inline `QrImage`) and inventory
  (⋯ action) tables; re-print ("Print again") stays allowed. **Scan-to-cart / scan-to-order**: a phone
  paired via **`scanner-pairing`** adds a line by scanning a product label — POS (`usePosScanner`) and New
  PO (`usePurchaseScanner`); a repeat scan **bumps qty**. Each pairing carries a **`PairingPurpose`
  (RECORDING | POS | PURCHASING | OPNAME)** so a scan only drives its own station (gated client-side; `recording_
triggered` fires ONLY for RECORDING — contracts unchanged, HARD CONSTRAINT #4 intact). Scanned codes are
  relayed **verbatim** (lenient `scannedCodeSchema`; strict resi `noResiSchema` only gates recording-create
  - manual/hardware-wedge entry — `normalizeBarcodeValue` was removed). The mobile reader accepts QR + 1D.
    Resolvers: `GET /sales|purchase-orders/variants/resolve?code=` → barcode-then-sku, case-insensitive.
    Scan feedback (beep + countdown ticks) is **browser-only** via `@/lib/scan-sound`. Realtime needs the
    socket host (`server.ts`, runs on the VPS + in dev); labels work anywhere. Detail in
    `.cursor/rules/30-scanner-pairing.mdc` + `…/40-inventory-marketplace.mdc`.
  - **Pairing robustness**: a phone QR scan ALWAYS (re)claims the session **owner** via the pairing-code
    credential — overriding a stale different-account login (else every pairing 403'd); the desktop
    "connected" indicator is **purpose-gated**; the QR carries `purpose` so the phone shows the right
    "Menghubungkan…" label immediately; **leaving a scan page (client nav) disconnects the phone**, a
    refresh keeps it (`useReleasePairingOnNavigate`).
  - **QR print**: `QrCodeDialog` prints ONE label through an isolated **iframe** (always a single centered
    page — the in-page modal print fought the page height) with a **Kecil/Sedang/Besar = 30/50/70 mm** size
    **dropdown** on Cetak; the label **studio** A4 sheet has a **1–4 column** size selector (fewer = bigger).
    Both variant + bundle dialogs show `labelPrintedAt` ("Terakhir dicetak").
- **Gotchas**: BullMQ jobId can't contain `:`; the dev server locks the Prisma engine DLL — stop it
  before `prisma generate`/migrate (index-only migration can use `--skip-generate` WITHOUT stopping);
  after adding a `page.tsx`/route, **typed routes** make `tsc` fail on `Route` literals until
  `next build` regenerates `.next/types` (build before typecheck); `next build` "collect page data"
  flake → re-run; a real provider adapter needs token-crypto lifted to a shared package.

## 13. UI / design system

Single locked theme **"Suar Dermaga" (Ombak v2)** — warm-paper ledger base + sea-glass horizon
wash, navy "hull" sidebar, suar attention tokens, teal accent, Plus Jakarta Sans + Geist Mono.
**REUSE** the shared primitives + patterns — see `.cursor/rules/50-ui-design-system.mdc`. Key:
status colors ONLY via `StatusBadge`/status tokens (never raw palette); query failures render
`ErrorState` w/ retry (loading → error → empty → data, no silent empties); list filters via
`useUrlFilters` + debounced search (under `<Suspense>`, skeleton fallback never null); forms via
RHF+zod with `FormLabel required` / iconed `FormDescription` / `NumberInput`; `Switch` for
toggles; a `⋯` DropdownMenu + `Tooltip` for row actions (no bare `title=`); destructive actions
always behind an AlertDialog confirm; two-column detail pages w/ eyebrow headers + layout-mirror
skeletons; data tables collapse to card lists under `sm` (table stays `sm+`); **one table dress**:
list tables bare in `overflow-x-auto rounded-xl border` (never inside a Card), detail item tables =
small count label over the same bordered table; `StatCard`
(num-display) / `EmptyState` / `DateRangePicker` (1 month <sm + presets) / `LowStockBadge`
(popover) / `BrandMark` / `WaveHairline` (hero/auth only) / `ChartLegend` + `useReducedMotion`.
Paginated tables: `usePagination` + `TablePagination`. QR: `QrImage` + `QrCodeDialog` (prints one
label via an isolated iframe — always one centered page — with a Kecil/Sedang/Besar size dropdown;
the labels-studio sheet picks 1–4 columns). Truncated cells: `EllipsisTooltip`. Per-variant photo: `VariantImage` popover. Scanner sound:
`@/lib/scan-sound` + `useSoundUnlock` + `useScanSoundPref` (per-station keys). **Shell**:
`components/layout/nav-config.tsx` is the SINGLE nav source (job-based groups Jualan/Stok/Katalog/
Kirim & retur/Laporan; CREATE_ACTIONS; MOBILE_TABS; SHELL_SUPPRESSED_ROUTES — page eyebrows match
the group names); `use-ops-pulse` badges nav counts from existing queries. **Command palette**
(Ctrl+K, `components/command-palette.tsx`): deterministic nav + create + Pandu router, **entity
jump** for S…/PO…/OP…/resi/SKU codes (`use-entity-jump.ts`) and a **scan-wedge** listener (a scan
gun burst opens it pre-filled); affordance copy advertises kode/resi/SKU. Dashboard home leads
with the **"Antrian kerja" briefing**; "Tutup hari" dialog = today-vs-yesterday + WA text recap.
**Pandu** assistant = honest stub (`components/pandu/`): deterministic nudges over existing
queries + keyword router, permanent "Pratinjau" label — never fake AI answers; the dock pill is
icon-only, draggable along the right edge and collapsible to an edge tab (persisted). Copy =
informal ID "kamu"; dates id-ID via `lib/formatters`. **Never run `next build` while the dev
server is up** (shared `.next`). Auth is already enforced — don't touch config/middleware/cookies
(HARD CONSTRAINT #2).
