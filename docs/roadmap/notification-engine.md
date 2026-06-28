# Palka — Notification Engine: persistent + WhatsApp evolution

> Companion to [`backlog.md`](./backlog.md) big-bet **A**. The **in-app tray shipped 2026-06-16** as an
> honest DERIVED feed (no schema, no worker — derived/client-only): a navbar bell over the same queries
> `useOpsPulse` + Pandu already keep warm. Files: `components/notifications/{use-notifications,notification-bell}.ts(x)`
>
> - `store/notifications-store.ts`. This doc is the **design for the next step** — evolve that derived tray
>   into a PERSISTENT event-log (history + cross-device read state) and add a **WhatsApp** delivery channel —
>   sequenced so value ships incrementally. NOT yet built;
>   schema needs confirmation first (HARD CONSTRAINT #1).

## Guiding constraints (why the design looks like this)

1. **The always-on VPS runs the full stack.** The BullMQ worker + Socket.IO now run in prod on the
   self-hosted Biznet VPS (Coolify). So persistence + delivery **can rely on the worker host**, and anything
   that needs a scheduler is a scheduled worker job — though the worker-dependent steps below are designed so
   the derived/instant first step ships independently.
2. **Org-scoped, multi-member** (HARD #6). A notification's audience is the org's members, so per-user read
   state is a **join table** (`NotificationRead`), never a `readAt` column (a column models only one reader).
3. **Additive, zero-downtime migrations.** Hand-written `migration.sql` + `db:migrate:deploy`; new tables/enums
   only, no `ALTER` on existing tables, empty start (the log starts fresh — no backfill).
4. **Honest + boundary-respecting.** The bell keeps its exact contract; the derived live signals stay (they
   drop to 0 the instant stock is fixed). Notifications are a **cross-cutting module** (`modules/notifications`)
   that other modules call via its service — exactly like `modules/audit` (§3 allows talking to a module
   through its service layer; this is NOT a boundary break, and audit is the proven precedent).

## Architecture — a two-tier read model (UNION)

The tray renders **both**, reconciled by a shared `dedupeKey` (the persistent mirror of today's per-datum id):

- **Persisted event-log** (`Notification` rows): discrete lifecycle events (order placed, refund, PO received)
  AND rolled-up signal snapshots. Survives reload, syncs across devices, server-side read state, history.
- **Live derived signals** (unchanged queries): the 7 ops-pulse parity counts (oversold, restock-urgent,
  low-stock, dead-stock, marketplace-unhealthy, orders-to-ship, returns-pending) stay responsive to live data.

`use-notifications` stays the **single selector** with an unchanged external contract
(`items[], unreadCount, hasUrgentUnread, markRead, markAllRead`); internally it folds persisted rows + live
candidates, deduped by `dedupeKey`. `notification-bell.tsx` doesn't change.

## Recommended schema (CONFIRM before building — HARD #1)

Split across phases. Conventions match `schema.prisma` (cuid, `organizationId` first, `actorUserId` nullable
= actor, snake_case `@@map`, UPPER_SNAKE enums; mirrors `AuditLog` / `MarketplaceSyncJob`). **Key decision:
per-user read = a JOIN TABLE, not a `readAt` column** (orgs have many members).

```prisma
// Phase 1
enum NotificationType {
  STOCK_OVERSOLD RESTOCK_URGENT LOW_STOCK DEAD_STOCK_CAPITAL
  MARKETPLACE_CHANNEL_UNHEALTHY ORDERS_TO_SHIP RETURNS_PENDING        // rolled-up parity set
  ORDER_PLACED ORDER_SHIPPED RETURN_OPENED RETURN_PROCESSED
  SALE_REFUNDED SALE_BELOW_COST PURCHASE_RECEIVED OPNAME_POSTED
  MARKETPLACE_SYNC_FAILED MARKETPLACE_TOKEN_EXPIRING TEAM_MEMBER_JOINED // discrete events
  SYSTEM                                                                // escape hatch (no migration per new producer)
}
enum NotificationCategory { INVENTORY ORDERS RETURNS SALES PURCHASING MARKETPLACE TEAM SYSTEM } // type→category = code lookup, not stored
enum NotificationSeverity { URGENT WARNING INFO SUCCESS }              // URGENT/INFO = superset of derived 'urgent'|'info'

model Notification {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])
  recipientUserId String?  // null = ORG-WIDE (all members; read per member). non-null = targeted personal event
  recipient       User?    @relation("NotificationRecipient", fields: [recipientUserId], references: [id])
  actorUserId     String?  // who triggered it (system/cron = null) — mirrors AuditLog.userId
  actor           User?    @relation("NotificationActor", fields: [actorUserId], references: [id])
  type            NotificationType
  category        NotificationCategory
  severity        NotificationSeverity @default(INFO)
  title           String
  body            String
  href            String?  // deep-link (matches AppNotification.href); Route<> brand applied in the web layer
  dedupeKey       String   // STABLE for rolled-up (no magnitude), entity-keyed for discrete
  entityType      String?  // loose ref, not FK — 'variant'|'order'|'return'|'sale'|'purchaseOrder'|'marketplaceConnection'
  entityId        String?
  data            Json?
  count           Int      @default(1) // rolled-up magnitude: bump + clear reads on rise, don't spawn rows
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  reads           NotificationRead[]
  deliveries      NotificationDelivery[] // Phase 4
  @@unique([organizationId, dedupeKey])              // idempotency: one row per logical event
  @@index([organizationId, recipientUserId, createdAt]) // tray query: org-wide OR mine, newest first
  @@index([organizationId, category, createdAt])
  @@index([entityType, entityId])
  @@map("notifications")
}

model NotificationRead {  // absence == unread; no create-time fan-out
  id             String   @id @default(cuid())
  notificationId String
  notification   Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  userId         String
  user           User     @relation(fields: [userId], references: [id])
  readAt         DateTime @default(now())
  @@unique([notificationId, userId])
  @@index([userId])
  @@map("notification_reads")
}

// Phase 3
model NotificationPreference { // userId null = org default; non-null = member override
  id             String   @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  userId         String?
  user           User?    @relation(fields: [userId], references: [id])
  category       NotificationCategory
  channel        DeliveryChannel
  enabled        Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([organizationId, userId, category, channel])
  @@index([organizationId, userId])
  @@map("notification_preferences")
}

// Phase 4 — the durable OUTBOX the cron/worker drains
enum DeliveryChannel { IN_APP WHATSAPP EMAIL }
enum DeliveryStatus  { PENDING SENDING SENT DELIVERED FAILED SKIPPED }

model NotificationDelivery {
  id              String   @id @default(cuid())
  notificationId  String
  notification    Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  organizationId  String   // denormalized for org-scoped drain queries + cleanup
  recipientUserId String
  recipient       User     @relation(fields: [recipientUserId], references: [id])
  channel         DeliveryChannel
  status          DeliveryStatus @default(PENDING)
  destination     String?  // WA number snapshot at enqueue
  attempts        Int      @default(0)
  nextAttemptAt   DateTime? // exponential backoff
  providerMessageId String?
  providerResponse  Json?
  errorCode       String?
  errorMessage    String?
  lastAttemptAt   DateTime?
  sentAt          DateTime?
  deliveredAt     DateTime?
  idempotencyKey  String   @unique // mirrors MarketplaceSyncJob
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([notificationId, channel, recipientUserId])
  @@index([organizationId, status])
  @@index([status, nextAttemptAt]) // drain: due PENDING rows
  @@map("notification_deliveries")
}
// User adds: notifications("NotificationRecipient") + actedNotifications("NotificationActor") + notificationReads + notificationPrefs + notificationDeliveries
// Organization adds: notifications + notificationPrefs + notificationDeliveries
```

**Dedupe** carries today's per-datum-id idea into the DB via `dedupeKey` + `@@unique([organizationId, dedupeKey])`:

- **Rolled-up** (oversold/restock/…): a **stable** key per `(org,type[,variant])` (no magnitude); on a rise the
  producer **bumps `count` + deletes existing `NotificationRead` rows** → re-arms unread for everyone (same UX as
  today's magnitude-in-id). Avoids piling `oversold:1,2,3,4` rows.
- **Discrete** (order/refund/PO): entity-keyed (`order-placed:<orderId>`); the unique makes a retried producer a
  safe no-op upsert.

## Generation strategy (derived/client-only first step vs the now-available VPS worker path)

| Pattern                                                                                                                                       | Events                                                                                                                                                                                                                                                                                                                                                                                                                                     | Where                                                                                                                                  | Status                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **After-tx (best-effort)** (one idempotent emit right after the tx commits — audit pattern, so a notification bug can't roll back the action) | `ORDER_PLACED`/`ORDER_SHIPPED` (`orders-server.service.ts` `pullOneConnection` ~514/605, guarded by `inventoryAppliedAt`/`inventoryShippedAt`), `RETURN_PROCESSED` (`returns-server.service.ts` `processReturn`), `SALE_REFUNDED`+`SALE_BELOW_COST` (`sales-server.service.ts` `createSale`/refund), `PURCHASE_RECEIVED` (`purchasing-server.service.ts` `receivePurchaseOrder`), `OPNAME_POSTED` (`stock-opname.service.ts` `postOpname`) | best-effort emit AFTER the tx commits                                                                                                  | ✅ works now (in the custom server)                                      |
| **Crossing-in-tx** (write ONLY on the boundary crossing, not every decrement)                                                                 | `LOW_STOCK` (prev>thr && new≤thr), `STOCK_OVERSOLD` (prev≥0 && new<0)                                                                                                                                                                                                                                                                                                                                                                      | `inventory-server.service.ts` apply\* tx                                                                                               | ✅ works now (in the custom server)                                      |
| **Scheduled recompute** (for the 7 rolled-up signals)                                                                                         | `STOCK_OVERSOLD`/`RESTOCK_URGENT`/`LOW_STOCK`/`DEAD_STOCK_CAPITAL`/`MARKETPLACE_CHANNEL_UNHEALTHY`/`ORDERS_TO_SHIP`/`RETURNS_PENDING`                                                                                                                                                                                                                                                                                                      | `POST /api/internal/notifications/recompute` (CRON_SECRET) runs the ops-pulse aggregates + upserts one stable-keyed row per (org,type) | ⏳ VPS-era worker/cron step — not built yet — a **snapshot**, not a diff |
| **Worker-scan** (VPS-era — worker host now exists, not built yet)                                                                             | `MARKETPLACE_SYNC_FAILED` (recorded inside the sync worker job), incremental `MARKETPLACE_TOKEN_EXPIRING` / health-tone-diff / dead-stock-diff (stateful daily scans), auto-detected `RETURN_OPENED` (best-effort outside the order tx)                                                                                                                                                                                                    | `@palka/queue` worker                                                                                                                  | ⏳ not built yet                                                         |

> Net: **all discrete + crossing events ship in prod via the custom server today**; the rolled-up-signal
> recompute + the 5 worker-only events are VPS-era worker/cron steps (the worker host now exists) — not built
> yet. Do **not** inline the rolled-up recompute into read services (couples every dashboard read to a write +
> N+1) — keep it on the scheduled-job route.

## Phased roadmap

| Phase                                                                 | Goal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Gate                         | Effort                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------- |
| **0 — Baseline** (shipped)                                            | Derived tray stays verbatim; lock the bell contract + confirm `dedupeKey` shape == current per-datum ids                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | none                         | done                            |
| **1 — Persistent log + server read-state** ✅ SHIPPED 2026-06-16      | `Notification`+`NotificationRead` migration; **`modules/notifications`** (service + meta + validators + errors + keys/hooks, mirrors `modules/audit`); `GET /api/v1/notifications` + `POST /read-all` + `POST /:id/read` (withApiRoute, Zod, one service); `use-notifications` becomes the UNION selector; read state on the DB for persisted rows (localStorage still serves the derived signals this phase). Bell unchanged. **Pure web-app, shares NONE of WhatsApp's gating.**                                                                                         | schema                       | done                            |
| **2 — Producers** ✅ SHIPPED 2026-06-16 (hybrid — see decision below) | ✅ done: 8 best-effort after-tx producers (SALE_BELOW_COST · PURCHASE_RECEIVED · RETURN_PROCESSED · OPNAME_POSTED · ORDER_PLACED · ORDER_SHIPPED · SALE_REFUNDED · RETURN_OPENED), RBAC category-filtering of the tray (`hiddenNotificationCategories`), and a "Lihat semua" paginated **history page** (`/dashboard/notifications`). **DEFERRED to a VPS-era worker/cron step (the worker host now exists), not built yet:** the scheduled recompute for the 7 rolled-up signals (they stay derived/instant for now), retire `notifications-store.ts`, retention cleanup. | none                         | done (hybrid)                   |
| **3 — Preferences**                                                   | `NotificationPreference` migration + `resolveNotificationChannels(org,user,category)` (precedence: user override > org default > code defaults — IN_APP on, WHATSAPP off, EMAIL off); Settings → "Notifikasi" matrix (member edits own; OWNER/ADMIN edit org default, gated like Peran & akses); tray honors STAFF view-permission keys                                                                                                                                                                                                                                    | schema                       | ~2–3d                           |
| **4 — WhatsApp delivery**                                             | `NotificationDelivery` outbox migration + `NotificationChannel` adapter (Twilio first); producers also INSERT PENDING delivery rows for opted-in members; drain via `POST /api/internal/notifications/drain` (CRON_SECRET, `FOR UPDATE SKIP LOCKED`, backoff); pre-approved UTILITY templates. Flip the drain to a `dispatch-notifications` BullMQ consumer (the VPS worker host now exists) — **producers untouched**.                                                                                                                                                    | external (Meta verification) | ~1–2wk + verification lead time |

## WhatsApp plan (adapter-first, outbox-backed, never a launch blocker)

- **Provider:** Phase A = **Twilio** behind a thin `NotificationChannel` adapter (`send(orgId, templateKey, params)`)
  — instant sandbox builds/demos the whole send path with NO Meta verification; pay-as-you-go; great TS fit.
  Phase B = migrate the **same adapter** to **Meta Cloud API direct + Embedded Signup** (each org onboards its
  own WABA → kills the ~20–40% BSP markup, true per-org sender). **Qiscus** is the fallback if local IDR billing
  - Bahasa Meta-verification help matters more than price. **Reject Fonnte/Watzap** (unofficial WhatsApp-Web
    automation = Meta ban risk + ToS violation) for production.
- **Topology (outbox-backed):** producers write `NotificationDelivery` rows (PENDING) as a durable
  **outbox** in the same tx as the `Notification`; a CRON_SECRET-gated `/api/internal/notifications/drain` route
  claims due rows, sends via the adapter, advances SENT/FAILED with backoff. The VPS worker host now exists, so
  a BullMQ consumer can drain the **same outbox** on any cadence (or the scheduled-job route can trigger the
  drain) — flip the runner, zero producer changes. Outbox accumulates harmlessly until then (no lost events).
- **Gating (start EARLY, in parallel):** Meta business verification is the long pole (~10 min to ~30 days).
  Alerts fire **outside** the 24h window → each type needs a **pre-approved UTILITY template** (strictly
  transactional copy; mis-categorizing as marketing is the #1 rejection). **ID utility rates rose ~25% in
  Jul 2025** — these are _paid_, model real per-message cost. Opt-in mandatory; coalesce bursty alerts; tokens
  stored encrypted like Lazada.

## Top risks

1. **Org-scope leak (multi-member):** read state MUST be the per-user `NotificationRead` join; tray query
   `organizationId=:org AND (recipientUserId IS NULL OR recipientUserId=:me)`; `withApiRoute` re-resolves
   membership. **RBAC gap:** should STAFF without `marketplace.view`/`reports.view` receive `MARKETPLACE_*`/
   `DEAD_STOCK` rows? Likely filter the tray by the same nav permission keys.
2. **Storm/dedupe:** crossing-guard low-stock/oversold; stable `dedupeKey` (no magnitude) + count-bump for
   rolled-up — the `(organizationId, dedupeKey)` unique collapses bursts (same as marketplace AUTO-sync coalescing).
3. **N+1 in hot tx:** one upsert per producer; `SALE_BELOW_COST` = one row with a line count (never per-line);
   never inline the rolled-up recompute into read services.
4. **localStorage→server migration race:** Phase 1 dual-read (read = either source); Phase 2 retires the store;
   no backfill (log starts empty). Brief cross-device unread flicker is accepted (tray polls; no live push yet).
5. **Not-yet-built blind spots:** 5 events are VPS-era worker steps not built yet; the scheduled recompute will
   cover the 7 rolled-up signals but is a _snapshot, not a diff_ (re-detects "unhealthy" but misses the transient sync-FAILURE moment).
6. **Retention/growth:** `NotificationRead` is per (notification,user) → a 10-member org multiplies rows; need a
   ~90d cleanup (mirror `cleanup-audit-logs.job.ts`). At very large scale, a denormalized `lastSeenAt` high-water
   mark on `OrganizationMember` can fast-path the bell badge instead of the unread anti-join.

## Open decisions (settle before building the relevant phase)

**Before Phase 1/2:**

1. **Rolled-up dedupe shape** — stable key + count-bump + clear-reads-on-rise (recommended, fewer rows) vs
   magnitude-in-key (mirrors today exactly, piles rows). Confirm the re-arm UX (re-notify when oversold 3→4?).
2. **Rolled-up producer placement** — scheduled recompute endpoint / worker job (recommended) vs inline upsert
   in read services. Plus the worker cadence.
3. **RBAC on org-wide alerts** — should the tray filter `MARKETPLACE_*`/`DEAD_STOCK`/reports rows by the same
   nav permission keys (so STAFF only sees what they can open)?
4. **Unread-count at scale** — accept the `NotificationRead` anti-join, or add a `lastSeenAt` high-water mark?
5. **Retention window N** (match audit-log cleanup, ~90d?).
6. **EMAIL channel** — drop from v1 (no email infra; invites go via WA) or keep as a disabled placeholder enum.

**Before Phase 4 (WhatsApp):** 7. **WA destination ownership** — store the number on `User` (the person) or `OrganizationMember` (the
membership)? Plus opt-in/verification flow (its own small migration). 8. **Provider for Phase A** — Twilio-first-then-Meta-direct (recommended) vs Qiscus (local IDR + Bahasa help). 9. **Drain trigger cadence** — how often the VPS worker / scheduled job drains the outbox for near-real-time WA. 10. **DELIVERED webhook reconciliation** — a public webhook updating `NotificationDelivery` by
`providerMessageId`, or is SENT (provider-accepted) good enough for v1?

---

## Decision (2026-06-16): hybrid now → full server-backed on VPS

The deploy now runs on an always-on **VPS**. That reframes the rolled-up-signal
question: a standalone scheduled recompute is unnecessary glue — the BullMQ worker can do it
with any cadence (per-minute / incremental diff) **and** that worker is the foundation WhatsApp (Phase 4) needs
anyway. So:

- **Shipped step:** keep the 7 rolled-up signals **derived/instant** (client, free, zero infra). Persist only
  **discrete events** (the 8 producers) + per-user server read-state +
  history page. This is NOT a dead end: the union selector + stable `dedupeKey` already leave room for persisted
  rolled-up rows, so the worker can fill them later **without touching the UI**.
- **VPS-era step (worker host now exists, not built yet):** a worker job recomputes/diffs the 7 rolled-up
  signals into persisted rows (retiring the derived tier + `notifications-store.ts`), runs retention, lights up
  the 5 worker-only events (sync-failed, token-expiring, health-diff, dead-stock-diff, auto-return), and drains
  the WhatsApp outbox (Phase 4).

---

_**Phase 1 + 2 (hybrid) shipped 2026-06-16** (branch `session/2026-06-16-notification-tray`): persistent
event-log + per-user server read-state + read API + UNION selector + **8 best-effort producers** + RBAC
tray-filtering + "Lihat semua" history page. The local dev DB apply was deferred (this checkout's `.env` lacks
`DATABASE_URL`); the migration is applied by the VPS `migrate` service / `pnpm db:migrate:deploy`._

_**Phase 3 (preferences) shipped 2026-06-21** (branch `session/2026-06-21-notification-preferences`):
`NotificationPreference` model (per `organizationId`/`userId`/`category`/`channel`, `userId` nullable for a
future org-default tier; `DeliveryChannel` enum reserved for Phase 4 — only `IN_APP` written) + a
`notificationPreferenceService` (missing row = ON, only opt-outs stored). The tray list + read-all routes
union the member's muted categories with the existing RBAC hiding; a **Settings → Notifikasi** tab (all
roles, self-scoped, RBAC-aware) toggles them. **Next:** the rolled-up persistence + retention + WhatsApp
(Phase 4) are VPS-era worker steps — the worker host now exists, not built yet (see Decision above)._
