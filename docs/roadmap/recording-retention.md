# Recording retention — configurable + dispute-aware (roadmap)

> Direction agreed 2026-06-21. The **30-day auto-cleanup already exists** but is (a) a hard-coded
> constant and (b) dormant on Vercel (the worker only runs on the VPS host). This doc captures the
> agreed evolution. Most of it is **VPS-era** (it tunes the cleanup worker); only the list marker is
> Vercel-safe and already shipped.

## Current state (verified)

- **`cleanup-recordings.job.ts`** (`packages/queue/src/jobs`): daily cron `'0 2 * * *'`. Retention =
  **`RECORDING_RETENTION_DAYS = 30`** (`packages/config/src/limits.ts`) — **hard-coded, no env var**.
  Flips `COMPLETED → PENDING_DELETE → DELETED`, **deletes the R2 video permanently**, keeps the DB row
  (soft-delete, for history/audit), and **decrements `Organization.storageUsedBytes`** by `fileSizeBytes`.
- Support jobs: `recalculate-storage` (self-heal usage), `verify-storage-consistency` (observe-only drift),
  `cleanup-failed-uploads` (sweep stuck/abandoned uploads). Manual `softDeleteRecording` deletes R2 +
  decrements quota instantly.
- ⚠️ **Dormant on Vercel** — `apps/worker` doesn't run there, so nothing is actually deleted until the VPS
  cutover. Disable everywhere with `WORKER_ENABLE_SCHEDULERS=false`.
- **Shipped (Vercel-safe):** an "auto-hapus ~N hari lagi" badge on the recording list (final week only),
  computed from `uploadedAt + RECORDING_RETENTION_DAYS` — reflects the policy, lives once the worker runs.

## Planned (VPS-era — tunes the cleanup worker)

### 1. Per-plan retention (configurable)

Different retention per `Organization.plan` instead of one global constant.

- **Option A (simplest):** a `plan → retentionDays` map in `@falka/config` (e.g. FREE 30, PRO 90). No schema.
- **Option B (most flexible):** a nullable `Organization.recordingRetentionDays` column (per-org override),
  falling back to the plan default → the global default. Schema migration (HARD #1).
- The cleanup job resolves retention **per org** (it already iterates orgs for storage) instead of reading
  the constant. The list marker reads the same resolved value so the badge stays accurate.

### 2. Dispute-evidence exemption

A recording linked to an order/return (matched by `noResi`/`trackingNumber`, case-insensitive — the existing
fulfillment join) should **not** be auto-deleted, since it's the packing proof for a dispute.

- **Approach A (derived):** the cleanup job skips a recording whose `noResi` matches a non-archived
  order/return (optionally only while the order/return is open, or for a longer window after it closes).
- **Approach B (explicit):** a `Recording.keepUntil` / `pinnedForEvidence` flag set when the link forms
  (best-effort, like `fulfilledAt`), checked by the cleanup job. Cheaper per-run, but needs the producer.
- Once this exists, surface a **"📌 disimpan — bukti sengketa"** pin on the recording list (the pin was
  intentionally NOT shipped with the countdown badge — it would be false until this exemption is real).

### 3. Pre-delete notification — NOT wanted

Owner declined. (The list marker already gives passive heads-up.)

### 4. Cold archive — DEFERRED (premature)

At this scale it's over-engineering: **R2 has no egress fee**, so storage cost is the only factor and it's
negligible at the current per-org quotas. If/when total storage grows enough to matter:

- **Cloudflare R2 Infrequent Access (IA) storage class** via a **bucket lifecycle rule** — objects transition
  to the cheaper IA tier after N days. Same bucket + same key, retrieval is **transparent** (no separate
  "restore" flow), billed per-GB on read. Same provider, **zero new infra**.
- **Avoid** a second provider (B2/Wasabi) at this phase — cross-provider credentials + a retrieval flow,
  not worth it.
- **Suggested windows:** standard 30–90 days/plan on R2 standard; dispute-exempt recordings kept ~1 year
  (or until the linked order/return closes + a grace period); transition to R2 IA only once storage is large.

## Open design decisions (resolve before building)

- Per-plan: config map (A) vs per-org column (B)?
- Dispute exemption: derived noResi match (A) vs explicit flag (B)? And the keep-window (open-only vs
  closed+grace vs fixed ~1yr)?
- Make `RECORDING_RETENTION_DAYS` env-driven as the global default regardless?
