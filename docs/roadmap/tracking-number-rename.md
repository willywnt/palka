# `noResi` → `trackingNumber` rename — plan

> Status: **PLANNED (not started)** · Authored 2026-06-19 · Owner-requested while closing the
> 2026-06-19 quick-wins batch (see [olshop-quick-wins-hardening-2026-06-19] memory). The deferred
> functional-`lower(noResi)`-index quick-win is **folded into this doc** instead of shipped
> standalone. Decision + execution plan, to be run as its own dedicated session.

## TL;DR

Rename the domain field `noResi` (mixed ID/English "nomor resi") to **`trackingNumber`** across the
DB column + every code layer — **259 occurrences / 67 files**, on the `Recording`, `Order`, and
`Return` models. The **Socket.IO contract is NOT touched** (payloads carry `barcode`, never `noResi`
— HARD CONSTRAINT #4 safe), and the **Indonesian UI copy stays "Resi"** (only the code symbol + DB
column are anglicized). The case-insensitive lookup index is folded in via a **normalized
`trackingNumberLower` column** (Prisma-native, no migration drift) rather than a raw `lower()`
functional index. **Sequence the rename to land with the VPS clean-start DB** (per
[olshop-deploy-plan]: no Neon data migration) so the breaking column rename carries zero prod risk —
do NOT deploy it to the Vercel/Neon stopgap.

## Why

- `noResi` mixes Indonesian + English; `trackingNumber` is a clean, conventional identifier and reads
  consistently with the rest of the codebase's English symbols.
- It's the moment to fix the long-deferred **case-insensitive `noResi` seq-scan** (all lookups use
  `mode: 'insensitive'` / ILIKE with no functional index) — we're already touching every write site,
  so adding a normalized column is incremental.

## Scope & non-goals

**In scope** — the field as a code symbol + DB column on 3 models:

| Model       | Field today      | Index today                         |
| ----------- | ---------------- | ----------------------------------- |
| `Recording` | `noResi String`  | `@@index([organizationId, noResi])` |
| `Order`     | `noResi String?` | none                                |
| `Return`    | `noResi String?` | none (copied from its order)        |

**Explicitly NOT touched:**

- **Socket.IO event contracts** (`scanner-pairing/socket/events.ts`) — every payload uses `barcode`
  (`BarcodeScannedClientPayload`, `RecordingTriggeredPayload`, etc.), never `noResi`. HARD #4 intact.
- **Indonesian user-facing copy** — labels like "Resi", "No. resi", placeholder text stay as-is.
  Sellers know the local term; only the internal identifier changes.
- The `barcode` concept itself (scanned codes are relayed verbatim; resi is only the matched value).

## Blast radius

259 occurrences across 67 files. Key symbols to rename (not exhaustive):

- DB column `noResi` → `trackingNumber` on the 3 models above (+ the existing Recording index).
- Validators: `noResiSchema` → `trackingNumberSchema` (recording-create / hardware-wedge entry).
- Recording Zustand store: `recording.store` field `noResi` (UI state — stays in Zustand, it's the
  in-progress input, allowed) + its consumers (`use-desktop-station-recording-sync`,
  `use-scanner-auto-recording`, `useRecordingStore((s) => s.noResi)`).
- Services: `recordingServerService.findRecentDuplicateResi` / `findByResi`,
  `ordersServerService.findByResi` / `markFulfilledByResi`, the order↔recording join logic.
- Route query param `?noResi=` (e.g. recordings duplicate-check, orders by-resi) → `?trackingNumber=`.
- Types, hooks, query keys, and any test fixtures referencing the field.

## Migration strategy (data-safe + de-risked)

1. **Hand-author the migration.** Renaming the Prisma field makes `prisma migrate` generate a
   **DROP + ADD** (silent data loss). Scaffold with `--create-only` then **edit the SQL to
   `ALTER TABLE "<t>" RENAME COLUMN "noResi" TO "trackingNumber";`** (+ rename the Recording index).
   Data is preserved.
2. **Ride the VPS clean-start.** Per [olshop-deploy-plan] the VPS launches on a fresh DB (no Neon
   migration). On a fresh DB the rename migration replays harmlessly (no rows to rewrite), so there's
   **no prod column-rename risk at all**. Keep the branch un-deployed on the Vercel/Neon stopgap
   (old deployed code reading `noResi` would break the instant the column is renamed under it).
3. The dev server locks the Prisma engine DLL — stop it before `prisma generate` / migrate (standard
   gotcha). `DATABASE_URL` IS present in root `.env` (the "lacks DATABASE_URL" note in
   [olshop-notification-tray] is stale), but **do not run a rename migration against any live DB**
   from a dev checkout — author it; let it apply on the clean-start deploy.

## Case-insensitive index — folded in (no drift)

The hot paths are **exact** case-insensitive matches: duplicate-resi check + order↔recording join.
Today they use `mode: 'insensitive'` (ILIKE) with no functional index → seq-scan.

**Decision: normalized companion column,** not a raw `lower()` functional index.

- Add `trackingNumberLower String?` (written lowercased at every write-path — already being touched by
  the rename) + a plain `@@index([organizationId, trackingNumberLower])`.
- Rewrite the exact lookups to `where: { trackingNumberLower: value.toLowerCase() }` (equality, uses
  the b-tree) instead of `{ trackingNumber: { equals, mode: 'insensitive' } }`.
- **No Prisma drift** — every object is expressible in `schema.prisma` (unlike a raw
  `CREATE INDEX … (lower(...))`, which `prisma migrate dev` would flag as drift forever).
- The order-list **substring** search (`contains`) stays a scan — low-frequency; a trigram/GIN index
  is a later, separate lever if it ever matters.

## Execution (commit-per-layer, gates green each)

1. Schema field + index rename + hand-authored RENAME migration (+ `trackingNumberLower` column &
   index); `prisma generate`.
2. `packages/*` references (if any) → `apps/web` services/repositories (incl. the normalized-write +
   equality-lookup rewrite).
3. Validators (`trackingNumberSchema`) → types.
4. Hooks + `recording.store` field + components → route query params.
5. Tests/fixtures.

## Verification

Unit tests **mock Prisma**, so a column rename + the normalized-write path are **invisible** to
`pnpm test` — they'd pass even if the DB column were wrong. Mandatory before "done":

- 4 gates: `typecheck` · `lint` · `build` · `test`.
- **E2E (Playwright, real app + DB)**: recording-by-resi create + duplicate detection, the
  order↔recording packing-station join, and POS/fulfillment smoke. This is the only layer that proves
  the renamed column + normalized lookups actually work end-to-end.

## Open questions (confirm before executing)

1. Confirm the rename **lands with the VPS clean-start** (not deployed to Neon).
2. Confirm **`trackingNumberLower` normalized column** over a raw `lower()` functional index
   (recommended — no drift).
3. Whether to also rename `Recording.generatedFilename` / storage-key conventions that embed the resi
   (likely leave keys as-is to keep existing R2 objects valid — confirm).

## Rollback

Pre-deploy: discard the branch. Post-deploy (clean-start only): the inverse `RENAME COLUMN` migration
restores `noResi`; no data transformation needed either direction.
