# Olshop — Project Rules (read fully every session)

Modular-monolith, pnpm@9 + Turborepo, Node ≥20. Edit code to match surrounding
style. These rules are derived from the actual refactored code — keep them true.

## 1. Stack

- **apps/web** — Next.js 15 App Router + React 19. Custom Node server
  `apps/web/server.ts` (run via `tsx watch server.ts`) attaches Socket.IO.
  Prod build = `next build` (Vercel) — **the custom server is NOT run on Vercel**.
- **apps/worker** — BullMQ background jobs.
- **packages/** = shared `@olshop/*`: `db` (Prisma+schema), `config` (env+limits),
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

Modules: `admin audit auth catalog inventory marketplace orders recordings scanner-pairing storage users`.

- A module owns its feature. Talk to another module ONLY through its conventional
  layer files (`services/`, `hooks/`, `validators/`, `types/`) — never reach into
  another module's deep internals.
- Cross-cutting/shared logic lives in `@olshop/*` packages or `apps/web/src/lib` —
  never duplicated per module.
- A submodule (e.g. `recordings/recovery/`, has its own `index.ts`) is internal to
  its parent domain; outside code goes through the parent.
- **CONFLICT RULE: preserve the boundary over removing duplication.** If dedup would
  force a boundary-breaking cross-import, keep the duplication (or lift to `@olshop/*`)
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
| **Repository / data**                   | Prisma queries (`@olshop/db`)                                                               | leak Prisma types past the module   |
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

**Logging:** `appLogger`/`logger` from `@olshop/logger`; structured `('event.name', { ctx })`.
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

## 12. Inventory / Marketplace MVP (catalog · inventory · marketplace · orders)

Internal inventory = **source of truth**, integrated with marketplaces (adapter-first, STUBS).
Detail: `.cursor/rules/40-inventory-marketplace.mdc` + `docs/roadmap/inventory-mvp.md`.

- **`StockLedger` (append-only) is the truth; `Inventory` is a fast-read cache** — every stock
  change = 1 ledger row + 1 Inventory update in one tx. The `inventory` module owns ALL stock
  writes; `catalog` (Product/Variant) reaches stock ONLY via the inventory service.
- **Outbound sync** lives in `packages/queue/src/marketplace-sync` (worker): a SoT change
  enqueues `propagate-inventory-stock` → `sync-marketplace-stock` → provider adapter (Dev stub
  simulates). **Inbound orders** decrement the SoT on PAID + propagate to the OTHER channels
  (anti-oversell), idempotent via `Order.inventoryAppliedAt`.
- **Built since the base MVP** (specifics in the cursor rule): reorder report (velocity →
  days-of-cover → suggested qty, honours per-variant `leadTimeDays`/`minOrderQty`); stock activity
  log (filter + paginate + CSV); variant editing; **multi-store order pull** (`pullFromConnections`,
  default all active, 30s per-store cooldown via `lastOrdersPulledAt`) on the Orders page; mapping an
  unmapped order item (`resolveOrderItem` → `mapByExternalRef`). Mapping is 1:1 per LISTING but a
  variant MAY map to many listings (cross-channel — do NOT force 1:1). Auto-map is NORMALIZED sku,
  NEVER edit-distance (`…-M` ≠ `…-L`); non-exact → `NEEDS_REVIEW`, sync stays off.
- **UI cross-module**: import another module's hooks/types, NOT its components — compose at the
  app layer (page).
- **Gotchas**: BullMQ jobId can't contain `:`; the dev server locks the Prisma engine DLL — stop it
  before `prisma generate`/migrate (but an index-only migration can use `--skip-generate` WITHOUT
  stopping); `next build` "collect page data" flake → re-run; a real provider adapter needs
  token-crypto lifted to a shared package.

## 13. UI / design system

Single locked theme **"Ombak"** (teal accent, Plus Jakarta Sans, charcoal sidebar). **REUSE** the
shared primitives + patterns — see `.cursor/rules/50-ui-design-system.mdc`. Key: list filters via
`useUrlFilters` + debounced search (page wrapped in `<Suspense>`); forms via RHF+zod with
`FormLabel required` / iconed `FormDescription` / `NumberInput`; `Switch` for toggles; a `⋯`
DropdownMenu + `Tooltip` for row actions; two-column detail pages; `StatCard` / `EmptyState` /
`DateRangePicker` / `LowStockBadge`. **Never run `next build` while the dev server is up** (shared
`.next`). Auth is already enforced — don't touch config/middleware/cookies (HARD CONSTRAINT #2).
