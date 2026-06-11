# Falka — Project Rules (read fully every session)

Modular-monolith, pnpm@9 + Turborepo, Node ≥20. Edit code to match surrounding
style. These rules are derived from the actual refactored code — keep them true.

## 1. Stack

- **apps/web** — Next.js 15 App Router + React 19. Custom Node server
  `apps/web/server.ts` (run via `tsx watch server.ts`) attaches Socket.IO.
  Prod build = `next build` (Vercel) — **the custom server is NOT run on Vercel**.
- **apps/worker** — BullMQ background jobs.
- **packages/** = shared `@falka/*`: `db` (Prisma+schema), `config` (env+limits),
  `logger`, `types`, `utils`, `metrics`, `health`, `queue`, `storage`, `rate-limit`,
  `redis`, `ui`, `eslint-config`, `typescript-config`.
- Server state → **TanStack Query v5**. UI state → **Zustand v5**.
  Auth → Auth.js (next-auth 5 beta, JWT). DB → Prisma+Postgres.
  Files → Cloudflare R2 (S3 SDK, presigned). Tests → Vitest.

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

Modules: `admin audit auth catalog inventory marketplace orders purchasing recordings returns sales scanner-pairing storage users`.

- A module owns its feature. Talk to another module ONLY through its conventional
  layer files (`services/`, `hooks/`, `validators/`, `types/`) — never reach into
  another module's deep internals.
- Cross-cutting/shared logic lives in `@falka/*` packages or `apps/web/src/lib` —
  never duplicated per module.
- A submodule (e.g. `recordings/recovery/`, has its own `index.ts`) is internal to
  its parent domain; outside code goes through the parent.
- **CONFLICT RULE: preserve the boundary over removing duplication.** If dedup would
  force a boundary-breaking cross-import, keep the duplication (or lift to `@falka/*`)
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
| **Repository / data**                   | Prisma queries (`@falka/db`)                                                                | leak Prisma types past the module   |
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

**Logging:** `appLogger`/`logger` from `@falka/logger`; structured `('event.name', { ctx })`.
Never `console.log`; never log secrets (errors go through `sanitizeError`).

**R2 presigned upload:** client → `POST /api/v1/uploads/presign` →
`uploadService.createPresignedUpload` (quota check → `storageService.generateUploadUrl`,
R2 signs **content-type only**) → browser `PUT`s the file straight to R2 →
`POST /api/v1/recordings` saves metadata. The server never proxies file bytes.

## 8. HARD CONSTRAINTS — confirm BEFORE touching

1. **Prisma schema & migrations** — `packages/db/prisma/schema.prisma`.
2. **Auth.js config** — `auth.config.ts`, `auth.ts`, `middleware.ts`, cookie options.
3. **Env var names/values** — see `turbo.json` globalEnv + `.env`.
4. **Socket.IO event contracts** — `scanner-pairing/socket/events.ts`:
   `pairing_connected`, `pairing_disconnected`, `barcode_scanned`, `barcode_ack`,
   `recording_triggered`, `station_recording_state`, `scanner_heartbeat`,
   `session_state`, `pairing_error`. Don't rename/repurpose payloads.
5. **Behavior of the 2 happy flows** — refactor structure freely, but behavior must not change.

## 9. Quality gate — green after EVERY change

`pnpm typecheck` · `pnpm lint` (`eslint . --max-warnings 0`) · `pnpm build` ·
`pnpm test` (vitest). **No `any`. No unused. No duplication. No oversized
multi-responsibility files.** pre-commit (husky+lint-staged) runs eslint --fix +
prettier. Repo line-endings = **LF**.

## 10. Anti-patterns (reject these)

Over-engineering · server state in Zustand · business logic/Prisma in a Route Handler
or UI · cross-module deep imports · multi-responsibility/oversized files · swallowing
errors or collapsing codes to `UNKNOWN` · `console.log` over `logger` · "fixing" the
socket by forcing `transports: ['websocket']` (see scanner rules — it is NOT a fix).

## 11. Workflow

Analyze & explain before changing · work incrementally **per-module** · **one logical
commit per change** · keep all gates green at every commit · report potential
bug/security/race/perf as **separate suggestions** (don't silently change) · when unsure
between approaches, **ASK** — boundary beats dedup.

## 12. Inventory / Marketplace MVP (catalog · inventory · marketplace · orders · returns · sales/POS · purchasing · order-aware recordings)

Internal inventory = **source of truth**, integrated with marketplaces (adapter-first, STUBS).
Detail: `.cursor/rules/40-inventory-marketplace.mdc` + `docs/roadmap/inventory-mvp.md`.

- **`StockLedger` (append-only, available-centric) is the truth; `Inventory` is a fast-read cache**
  (available/reserved/damaged/incoming) — every stock change = 1 ledger row + 1 Inventory update in
  one tx. The `inventory` module owns ALL stock writes; `catalog` (Product/Variant) reaches stock
  ONLY via the inventory service.
- **Catalog variants / subvariants** (`catalog`): the **variant is the SKU/stock leaf** (unchanged);
  **`ProductVariant.variantGroup String?`** is an optional grouping **label** — a variant is either a
  **standalone SKU** or a **named group of subvariant SKUs** (siblings share one `variantGroup`). A product
  may have **0..N** variants (create-without-variant, add later from detail). Grouping is **display-only** —
  inventory/ledger/orders/sales/PO/marketplace stay at the leaf, **no deeper stock level**. Shared builder
  `variant-blocks-field.tsx`; SKU auto-gen; **soft-delete frees the SKU** (`archivedSku`) and is gated by a
  cross-module **delete preflight** `getDeletionBlockers` (marketplace-mapped / reserved / incoming /
  open-PENDING-return = **block**; on-hand + damaged = **warn**). **Per-variant photo**
  (`imageKey`/`imageUrl`) lives in a **separate PUBLIC R2 bucket** (recordings bucket stays private),
  client-compressed to WebP, shown in a `VariantImage` popover by the name. R2 uses **per-bucket public
  URLs** (`<base>/<key>`, NO bucket in the path): `R2_RECORDINGS_BUCKET_NAME`+`R2_PUBLIC_URL`,
  `R2_PRODUCTS_BUCKET_NAME`+`R2_PRODUCTS_PUBLIC_URL`.
- **Outbound sync** lives in `packages/queue/src/marketplace-sync` (worker): a SoT change enqueues
  `propagate-inventory-stock` → `sync-marketplace-stock` → provider adapter (Dev stub simulates).
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
  packing video as **dispute evidence**. Links work both ways.
- **Offline sales / POS** (`sales` module — `Sale`/`SaleItem`, `SalePaymentMethod` CASH/QRIS/TRANSFER,
  `SaleStatus` COMPLETED/VOID): a counter sale **decrements the SoT immediately** (`available−`, ledger
  reason `SALE` / source `POS`, ref = saleId) in one tx, then propagates to **all** channels (selling
  in-store can't oversell online). Oversell is allowed — goods are in hand. Code `S00001` per-user.
  Velocity counts `SALE` too (`SALES_LEDGER_REASONS` = `ORDER_RESERVE`+`ORDER_RELEASE`+`RETURN`+`SALE`).
- **Purchasing / restock** (`purchasing` module — `PurchaseOrder`/`PurchaseOrderItem`,
  `PurchaseOrderStatus` ORDERED→PARTIALLY_RECEIVED→RECEIVED/CANCELLED): lights up the **`incomingStock`**
  bucket. Create a PO → `adjustIncomingTx(+qty)` per line (forecast bucket, **no ledger row**, available
  unchanged). **Receive** (partial per-line, clamped to outstanding) → `applyPurchaseReceiveTx`
  (`incoming−`, `available+`, ledger `RESTOCK` / source `PURCHASE`), recompute status, propagate to all
  channels. **Cancel** (pre-receive) → `adjustIncomingTx(−outstanding)`. `supplierName` is **free text**
  (no Supplier entity yet); variant `cost` stays manual. Code `PO00001` per-user. The reorder report's
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
  labels-studio "Bundles" tab. Catalog owns it (`resolveBundles`/CRUD/image/labels); sales/purchasing call its
  service, never the tables. Marketplace orders NOT bundle-aware (deferred). Detail: `…/40-inventory-marketplace.mdc`.
- **Reorder + activity**: reorder report (velocity → days-of-cover → suggested qty, honours per-variant
  `leadTimeDays`/`minOrderQty`); stock activity log (filter + paginate + CSV); variant editing. Demand
  velocity sums `ORDER_RESERVE`+`ORDER_RELEASE`+`RETURN` (net), excludes the delta-0 `ORDER_SHIP`.
- **Mapping / pull**: mapping is 1:1 per LISTING but a variant MAY map to many listings (cross-channel
  — do NOT force 1:1). Auto-map is NORMALIZED sku, NEVER edit-distance (`…-M` ≠ `…-L`); non-exact →
  `NEEDS_REVIEW`, sync stays off. `resolveOrderItem` maps an unmapped item (`mapByExternalRef`).
  **Multi-store pull** `pullFromConnections` (default all active, 30s per-store cooldown).
- **UI cross-module**: import another module's hooks/types, NOT its components — compose at the app
  layer (page). **Dev data**: `pnpm db:reset-demo` resets the demo orders/returns/sales/stock to re-test
  the loop (then restart the dev server to rewind the stub pull timeline).
- **QR-scan (POS phase 2) — ✅ shipped.** Per-SKU **QR labels**: a label studio at `/dashboard/labels`
  (catalog) prints an A4 grid encoding `barcode ?? sku` (`listLabelVariants` paginated, already-printed
  sort last). **`ProductVariant.labelPrintedAt`** records the last print (`markLabelsPrinted`) — surfaced
  in the labels picker + a shared **`QrCodeDialog`** on the product-detail (inline `QrImage`) and inventory
  (⋯ action) tables; re-print ("Print again") stays allowed. **Scan-to-cart / scan-to-order**: a phone
  paired via **`scanner-pairing`** adds a line by scanning a product label — POS (`usePosScanner`) and New
  PO (`usePurchaseScanner`); a repeat scan **bumps qty**. Each pairing carries a **`PairingPurpose`
  (RECORDING | POS | PURCHASING)** so a scan only drives its own station (gated client-side; `recording_
triggered` fires ONLY for RECORDING — contracts unchanged, HARD CONSTRAINT #4 intact). Scanned codes are
  relayed **verbatim** (lenient `scannedCodeSchema`; strict resi `noResiSchema` only gates recording-create
  - manual/hardware-wedge entry — `normalizeBarcodeValue` was removed). The mobile reader accepts QR + 1D.
    Resolvers: `GET /sales|purchase-orders/variants/resolve?code=` → barcode-then-sku, case-insensitive.
    Scan feedback (beep + countdown ticks) is **browser-only** via `@/lib/scan-sound`. Realtime needs the
    socket host (`server.ts`, gated off on Vercel) → dev/VPS only; labels work anywhere. Detail in
    `.cursor/rules/30-scanner-pairing.mdc` + `…/40-inventory-marketplace.mdc`.
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
skeletons; data tables collapse to card lists under `sm` (table stays `sm+`); `StatCard`
(num-display) / `EmptyState` / `DateRangePicker` (1 month <sm + presets) / `LowStockBadge`
(popover) / `BrandMark` / `WaveHairline` (hero/auth only) / `ChartLegend` + `useReducedMotion`.
Paginated tables: `usePagination` + `TablePagination`. QR: `QrImage` + `QrCodeDialog`. Truncated
cells: `EllipsisTooltip`. Per-variant photo: `VariantImage` popover. Scanner sound:
`@/lib/scan-sound` + `useSoundUnlock` + `useScanSoundPref` (per-station keys). **Pandu**
assistant = honest stub (`components/pandu/`): deterministic nudges over existing queries +
keyword router, permanent "Pratinjau" label — never fake AI answers. Copy = informal ID "kamu";
dates id-ID via `lib/formatters`. **Never run `next build` while the dev server is up** (shared
`.next`). Auth is already enforced — don't touch config/middleware/cookies (HARD CONSTRAINT #2).
