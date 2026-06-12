# Falka UI/UX Redesign — Phase 0: Audit & Plan

> Status: **Phases 1–4 implemented (2026-06-11) — 28 commits on `feat/redesign-falka`, all gates
> green. Remaining: visual QA on a running dev server (dark-mode/mobile spot-checks) + the §5
> separate suggestions, which still need explicit approval.**
> Branch: `feat/redesign-falka`. Method per task brief: Phase 0 audit → pick 1 of 3 visual
> directions → Phase 1 tokens/foundations → Phase 2 shared components → Phase 3 per-surface
> rollout (one commit per surface) → Phase 4 polish. Gates green at every commit.

---

## 1. Audit summary

A 13-area parallel code audit covered every surface: shell/layout, landing+auth, dashboard
home+reports, catalog, bundles, inventory, marketplace, orders+returns, sales/POS+purchasing,
recordings+scanner, settings/admin, shared primitives/tokens/a11y, and branding/meta assets.

### What is already good (protect it)

- **Token discipline**: OKLCH set with genuinely split warm neutrals, `--border` ≠ `--input`,
  signed-up/down pair hue-separated from destructive — documented inline in `globals.css`.
- **`.num` + `.eyebrow`** broadly adopted; `NumberDelta` gets typography right (U+2212, em-dash
  zero, mono). Hairline-over-shadow elevation honored (only 3 stray shadows tree-wide).
- **Primitives genuinely reused**: PageHeader/StatCard/EmptyState/TablePagination/DateRangePicker/
  QR kit/ImageUploadPopover; Skeleton in 31 files, EmptyState in 20.
- **Charts are tokenized**, code-split, id-ID tick abbreviations, hairline tooltips.
- **Informal-ID "kamu" voice** consistent on core dashboard surfaces; smart details (cookie-seeded
  sidebar = no flash; DateRangePicker draft+Apply; print isolation; focus-visible ring on all
  form primitives; recording-reliability + mobile-scanner state machines are excellent).

### Top gaps (the redesign must answer)

1. **Brand absence** — zero favicon/og-image/manifest/SVG mark; the "brand" is an inline
   letter-"F" `<span>` hand-copied in 5 files; landing/auth use the generic blurred-blob SaaS
   trope; `<html lang="en">` on an Indonesian app; auth panel copy is English.
2. **Zero branded error/404/loading routes** — unbranded Next defaults, even on the public
   buyer-facing `/share/[token]` evidence page (the one URL sellers paste into disputes).
3. **Mobile debt** — nav Sheet can't scroll and stays open after navigating; the big tables
   (inventory 8-col, product-detail variants, channel 9-col, PO receive, recordings) are
   horizontal-scroll-only with actions off-screen; POS total/checkout below the fold; the
   DateRangePicker always renders 2 months (~600px) and overflows phones; no bottom nav.
4. **Status-color sprawl** — ~88 raw Tailwind palette lines (emerald/amber/sky/rose) in
   per-module status badges, mostly without `dark:` variants; the reorder SOON badge is ~1.9:1
   contrast (AA fail); losses/negative margins use destructive red where the system mandates the
   ember `--signed-down`.
5. **Swallowed errors** — many query failures render as empty states ("Varian tidak ditemukan",
   "Belum ada listing diimpor", silent label-studio/POS-picker/storage failures); several pages
   render error banner + misleading EmptyState together; no shared ErrorState with retry.
6. **`prefers-reduced-motion` honored exactly once** (`.scan-line`); overlays, charts, pulses,
   pings unguarded.
7. **English pockets at the most stressful moments** — auth funnel + auth error messages,
   scanner `STATION_PURPOSE_META`, the whole upload-recovery surface, marketplace token/status
   strings, POS scan toasts; `formatRelativeTime`/`formatDateTime` not id-ID.
8. **Dormant trend layer** — StatCard `delta` prop and a finished `Sparkline` exist with zero
   call sites; charts have no visible legends (hover-only = nothing on touch) and no aria.
9. **No assistant surface** — but the navbar has a reserved (commented) NotificationBell slot,
   and the audit identified rich, concrete Pandu slots on every surface (insight cards, NL query
   over existing URL filters, EmptyState chips, anomaly nudges, daily digest in the hero).
10. **IA nits** — "Rekam" vs "Rekaman" adjacent one-letter items; "Insight" section label is
    English; sidebar Create menu offers rare actions (Hubungkan toko) and omits the frequent
    ones (POS sale, PO); settings = 2 of 3 placeholder tabs landing on a placeholder by default.

Full per-area findings (surfaces, issues w/ file refs, opportunities, Pandu slots) live in the
audit run output; high-severity items are folded into the phase plan below.

---

## 2. Scope guardrails

- **Presentation/UI/copy only.** No business logic moves; layering per CLAUDE.md §5 stays.
- **Untouched**: Prisma schema/migrations, Auth.js config/middleware/cookies, Socket.IO event
  contracts, env var names. All features/routes/flows preserved.
- **Pandu is a stub, honestly labeled** ("· otomatis" / "pratinjau"): deterministic client-side
  selectors over queries that already exist (reorder URGENT rows, oversold count, NEEDS_REVIEW
  mappings, open returns) + a keyword router onto existing `useUrlFilters` URLs. Real numbers,
  rule-based prioritization, zero new endpoints, no generated prose. Swapping in the real AI
  later replaces one resolver.
- Items that need **new behavior** (orders list search/filters, kembalian calculator, struk
  print, marketplace reconnect path, forgot-password) are listed in §5 as separate suggestions —
  not silently bundled into the redesign.

---

## 3. The three visual directions

All three: keep teal `--primary` + charcoal family + PJS/Geist Mono, add a real `BrandMark` SVG
(replacing the 5 letter-F spans) + favicon/og/manifest + `lang="id"`, introduce token-based
status colors (retiring the ~88 raw palette lines via one shared `StatusBadge`), re-point losses
to `--signed-down`, add the global `prefers-reduced-motion` guard, branded error/404/loading
routes, and a first-class (stubbed) Pandu. They differ in how far the brand world goes.

### Direction A — "Garis Air" (Quiet Instrument)

- **Tagline**: Ketelitian buku kas Swiss, napas pelabuhan yang tenang.
- **Mood**: precision instrument panel in ink on warm paper; exactly one drop of sea. Braun/Rams,
  Swiss annual-report typography, Linear restraint.
- **Color**: everything stays verbatim except `--muted-foreground` 0.53→0.50 (AA at small meta).
  Additive: `--brand-ink` oklch(0.30 0.05 215) for wordmark/display/brand-eyebrow;
  `--pandu-surface`/`--pandu-border` = the ONLY teal-tinted fill, reserved for Pandu; 5 status
  trios (`--status-ok/warn/info/danger/neutral`, light+dark, all ≥4.5:1).
- **Type**: 4px baseline grid. Display 28/34 w650 −0.02em in brand-ink; H1 22/28 600; body 14/22
  450; KPI mono value 26/32 500; `eyebrow-brand` variant (max once per page).
- **Motion**: 150/200ms only + two 320ms signature moments (palette open, waterline draw-in).
  Numbers never animate ("ledger honesty"). Global reduced-motion guard.
- **Maritime budget**: ONE structural motif — the **waterline hairline** (border→primary/30→border)
  under PageHeader/hero/auth only; falcon-eye `BrandMark`; maritime words only as eyebrows
  ("ANJUNGAN" above Dashboard, "SUAR" on error routes); EmptyState line-art ≤64px; falcon-eye
  focus ring (+1px brand-ink/35 offset). Tables/badges/forms are motif-free zones.
- **Pandu**: navbar-center **command bar** ("Tanya Pandu… ⌘K") opening a cmdk palette (nav +
  actions + "Pandu menjawab" stub zone); reserved bell slot = Pandu status dot w/ nudge count;
  "CATATAN PANDU · otomatis" card (max 3 nudges) in the hero; reusable `<PanduHint>` inline row.
  Mobile: full-screen palette Sheet (rebuild fixes the broken nav Sheet), nudges = snap chips.
- **Risk**: can read as "nothing changed" — mitigate by shipping BrandMark + waterline + Pandu
  bar first.

### Direction B — "Suar Dermaga" (Harbor Light, Expressive Calm) ← boldest

- **Tagline**: Ledger on paper, light on water — buku tetap rapi, lautnya mulai terasa.
- **Mood**: dawn at a working Indonesian harbor; tide-table aesthetics × Linear restraint.
- **Color**: light paper neutrals + teal + signed pair + charts stay verbatim. NEW `--sea-glass`
  (light 0.972 0.012 200 / dark 0.205 0.018 230) used ONLY as a horizon wash on the dashboard
  main (`linear-gradient` fading to paper by 320px; ΔL ≤0.02) and as Pandu surfaces. Sidebar →
  "hull at dusk" navy-charcoal (0.22 0.02 252, hue locked ≤252 = never purple); dark neutrals
  de-violet 285→250. Beacon system: keep `--highlight` as fill-only, add `--highlight-strong`
  (≥4.5:1) — fixes the SOON badge; status tokens `--status-info/warn/ok` (warn/ok alias
  highlight-strong/signed-up).
- **Type**: fonts stay; Display 28/34 700 −0.02em; new **`num-display`** utility (mono 28/30 700
  −0.025em) for hero numerals — StatCard graduates to numeral + sparkline + delta; w800 reserved
  for the wordmark.
- **Motion**: `--ease-tide` cubic-bezier(0.25,0.8,0.3,1); 280–320ms dock/dialog enters; one-shot
  600ms chart draw; skeleton = "shimmer-on-water" sea-glass sheen (replaces pulse); Pandu beacon
  breathes on a 6s interval. Global reduced-motion guard + `usePrefersReducedMotion` → recharts.
- **Maritime budget**: SVG mark = falcon-eye over two wave strokes; ONE wave hairline divider
  (hero + landing/auth only); 4 capped line-art SVGs (lighthouse→error routes, buoy→EmptyState,
  gull→success, crane→long jobs); reserved bell slot becomes **"Suar"** (amber beacon, lit only
  when something needs attention); eyebrows carry the harbor layer ("ANJUNGAN · RABU, 11 JUNI");
  loading microcopy "Menarik jangkar…" on route loading only. Nav labels stay functional.
- **Pandu**: **persistent dock** — bottom-right pill (48px, falcon-pilot glyph, amber dot when
  urgent), suppressed on POS-checkout/scanner/active-recording; opens a 360px sea-glass card:
  max-3 nudge stack + "Tanya stokmu…" NL bar + permanent "PRATINJAU" footer. Hero NL bar on the
  dashboard only. Mobile: pill above the (proposed) bottom nav → 85svh bottom Sheet.
- **Risk**: horizon wash could band/read "gradient SaaS" (kill-switch fallback to solid);
  theme-park creep (motifs hard-capped); dock occlusion on mobile (route suppression list).

### Direction C — "Falcon Deck" (Mata Elang di Anjungan, international sharp)

- **Tagline**: Instrumen presisi di atas air tenang.
- **Mood**: nautical instrument panel; Admiralty-chart hairlines, Flighty confidence, first-class
  "Night Watch" dark mode for sellers working past midnight.
- **Color**: light paper + teal + signed pair + charts stay. Evolves: `--foreground` → ink
  oklch(0.165 0.008 250) (~15:1); `--muted-foreground` → 0.47; sidebar → "deck steel"
  oklch(0.205 0.012 250); **`--radius` 0.875→0.75rem** (subtly more angular). NEW `--steel`
  (cold secondary accent — lines/text only, never fills) + status ramp `--warning/--info/
--positive/--critical` w/ soft pairs (fixes SOON). Dark mode re-tuned: night-sea 0.16 0.01 250,
  crisper white/12% hairlines.
- **Type**: fonts stay; Display 28 w800 −0.025em; body 14 w450; `.num-display` mono 600
  clamp(1.75–2rem) for KPI/POS totals; new **`.readout`** utility (mono 10.5px caps, steel) for
  timestamps/SKU/coordinates microcopy. PJS never below 450.
- **Motion**: three speeds — "snap" 80ms (falcon reflex: hover/press/focus), "glide" 180ms
  (rail/sheet/dropdown), "settle" 240ms (chart/nudge enter); one KPI count-up per viewport,
  first mount only. Global reduced-motion guard.
- **Maritime**: precision-nautical, no illustration — geometric falcon-wing chevron mark (◣◢ over
  a waterline stroke); compass-tick eyebrow prefix (::before, aria-hidden); `.readout`
  coordinates line in topbar/hero ("06°54'S 107°36'E · RAB 11.06"); chart grids as "depth
  soundings"; "Suar" = the branded error routes. "Insight" → "Wawasan".
- **Pandu**: **right-edge rail** — 320px panel, default-open ≥2xl, collapses to a 48px edge tab
  below (overlay on open); toggle = falcon-eye dot in the reserved bell slot; anatomy: NL bar →
  "Sorotan hari ini" (max-3 nudges, one action chip each) → per-route explainer footer ("Apa itu
  days-of-cover?"). Cookie-seeded open state. Mobile: top nudge = one swipeable card under the
  hero; navbar button opens a 90svh Sheet.
- **Risk**: cooling the palette can erode "tenang" warmth (steel = line-only guardrail); rail vs
  8-col tables on 1280–1440px laptops (collapse rule needs device QA); radius change touches
  everything (one-token revert).

---

## 4. Phase plan (after the pick)

**Phase 1 — Design language & foundations** (tokens + brand chrome; ~4–6 commits)

1. `globals.css`: chosen direction's token changes + status trios + motion easings + the global
   `prefers-reduced-motion` guard + new utilities (`num-display`/`waterline`/`readout` per pick).
2. `BrandMark` component replacing the 5 inline spans; `app/icon.svg`, `apple-icon`,
   `opengraph-image` (+ data-free share variant), `manifest.ts` (start_url `/mobile/connect`
   candidate), `metadataBase` from `NEXT_PUBLIC_APP_URL`, `viewport` themeColor pair,
   `<html lang="id">`, robots.ts.
3. Branded `not-found.tsx`, `error.tsx`, `global-error.tsx`, route `loading.tsx` (incl. share
   page) in the chosen direction's voice.
4. Pandu foundation: nudge selector hook (deterministic, over existing queries), dismissal store
   (Zustand ui-store + localStorage), and the chosen surface shell (command bar / dock / rail),
   honestly labeled.

**Phase 2 — Shared component library** (~8–10 commits)

- `StatusBadge` (token map) + migrate all per-module badge maps (~88 lines, one module per commit).
- `ErrorState` primitive (icon + ID copy + "Coba lagi" refetch) + fix every swallowed-error/
  error-masked-as-empty site; EmptyState gains illustration slot + error tone.
- `ChartLegend`; wire dormant StatCard `delta` + `Sparkline`; chart aria (`role="img"` + ID
  summary) + reduced-motion via the shared hook.
- DateRangePicker: 1 month under `sm` + preset chips (Hari ini/7 hari/30 hari/Bulan ini).
- Overlay hardening: Dialog/Sheet max-h + scroll, ≥24px close target, sr-only "Tutup"; Select
  `text-base md:text-sm` (iOS zoom); mobile nav Sheet (scroll + close-on-navigate); skip-to-content;
  PageHeader action wrap; TablePagination touch targets; LowStockBadge/EllipsisTooltip → focusable
  popover pattern; sonner tokenized (drop richColors).
- Mobile patterns: shared card-row list collapse (<sm) for data tables; sticky bottom action bar
  (POS/receive); `h-dvh` shell.

**Phase 3 — Per-surface rollout** (one commit per surface, in this order)
landing → auth (full ID localization incl. validators/AUTH_ERROR_MESSAGES) → shell/nav (IA fixes:
Rekam→"Rekam packing", Insight→ID label, Create menu reweighted; mobile bottom nav per direction)
→ dashboard home (Anjungan hero + Pandu) → reports (mobile table strategy, legends, URL-synced
tab) → products → product detail (mobile cards, PageHeader) → bundles (URL filters, RHF forms,
destructive confirm styling) → inventory overview/activity/reorder (mobile cards, source labels,
TablePagination, SOON/URGENT tokens) → marketplace (localize strings, detail header+aside,
listing pagination/filters) → orders+returns (status tokens, Tolak confirm, evidence loading
states, PageHeader) → sales/POS (sticky checkout, ID scan toasts, payment labels, oversell alert
wrap) → purchasing (cancel confirm, receive mobile, twin-copy unification) → recordings+scanner
(localize recovery + STATION_PURPOSE_META + fix localhost string, `.num` sweep, card rows) →
settings (default tab, `?tab=` sync, Umum populated with existing prefs, EmptyState placeholders).

**Phase 4 — Polish**
Locale sweep (id-ID date/relative formatters), skeleton fidelity pass (mirror layouts; replace
`fallback={null}`), a11y audit (aria-sort, aria-live countdown, focus on sidebar links, AA
spot-checks both themes), dark-mode parity pass, print-label brand footer, motion QA, update
`.cursor/rules/50-ui-design-system.mdc` (tokens, StatusBadge/ErrorState/Pandu patterns, glossary
additions), final mobile pass on POS/scanner/inventory.

---

## 5. Separate suggestions (need explicit approval — new behavior, not redesign)

> Update 2026-06-12: items **1** (orders search + status filters), **2** (kembalian calculator +
> struk print), and **7** (products list pagination) have since shipped. The follow-up UX work
> lives in `docs/roadmap/ux-overhaul-2026-06.md` (§5 there tracks shipped vs still-open).

1. Orders list search + status filters (hook/service take new params today: page/pageSize only).
2. POS kembalian (cash-received) calculator; struk print/share on sale detail.
3. Marketplace reconnect path for disconnected stores (UI promise currently unkept).
4. Forgot-password affordance + show-password toggle (auth).
5. Print stamping: move `markLabelsPrinted` to after `window.print()` confirmation.
6. `formatStoragePercent` returns 100% for unprovisioned quota (alarming false "full").
7. Products list pagination (currently fetches the full array).
8. Settings "Tim" tab on the existing users-module skeleton; audit-log UI ("Riwayat aktivitas").
