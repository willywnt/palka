'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import type { Route } from 'next';
import type { OrgRole } from '@falka/types';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  ClipboardCheck,
  Clock,
  CornerDownLeft,
  Layers,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Truck,
} from 'lucide-react';

import { BrandMark } from '@/components/brand-mark';
import {
  CREATE_ACTIONS,
  isShellSuppressedRoute,
  navItemAllowed,
  sidebarNavSections,
  type NavItem,
} from '@/components/layout/nav-config';
import { PANDU_SUGGESTIONS, routePanduQuery } from '@/components/pandu/pandu-router';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useEntityJump } from '@/components/use-entity-jump';
import {
  compareMatches,
  scoreEntry,
  toSearchable,
  type MatchResult,
  type SearchField,
  type Searchable,
} from '@/lib/search/fuzzy-search';
import { highlightSpans } from '@/lib/search/highlight';
import { cn } from '@/lib/utils';
import { useOrg } from '@/modules/users/hooks/use-org';
import type { PermissionKey } from '@/modules/users/permissions/catalog';
import {
  useCommandHistoryStore,
  type CommandHistoryEntry,
  type HistoryIconName,
} from '@/store/command-history-store';

/*
 * The command palette — one deterministic surface for "pergi ke mana saja,
 * buat apa saja, tanya Pandu" (Ctrl+K / ⌘K, or the navbar search button).
 * Honest by construction: every result is a real route; free-text falls
 * through the same keyword router Pandu uses, never a generated answer.
 * Code-looking queries (S00001, PO00001, a resi, a SKU/barcode) additionally
 * resolve to real records as "Lompat ke" entries — see use-entity-jump.
 */

type PaletteEntry = {
  id: string;
  title: string;
  /** Small right-aligned context label (group name / "Pandu · Pratinjau"). */
  hint: string;
  icon: ComponentType<{ className?: string }>;
  href: Route;
  /** Precomputed match target (title + keyword/section fields). */
  searchable: Searchable;
  /** Carried over from the NavItem — gated entries are filtered out at render time. */
  minRole?: NavItem['minRole'];
  permission?: NavItem['permission'];
};

/** A scored entry — `match` is present only for fuzzy-ranked (typed-query) hits. */
type RankedEntry = PaletteEntry & {
  match?: MatchResult;
  /** A recalled search string — selecting the row re-runs it in place (no nav). */
  recentText?: string;
  /** Preserved icon name for a recalled destination, so re-recording keeps it. */
  iconName?: HistoryIconName;
};

const KEYWORD_WEIGHT = 1;
const SECTION_WEIGHT = 0.5;
/** Cap the ranked result list so the longest tail never buries the best hits. */
const MAX_RANKED = 8;
/** Group heading + right-label for the recents group (drives the eyebrow grouping). */
const RECENTS_HINT = 'Terakhir';
/** Mirrors the store — too-short queries aren't worth recording or recalling. */
const MIN_RECORDED_QUERY = 2;

/** Resolve a stored icon name to a component (the store keeps only the name). */
const HISTORY_ICONS: Record<HistoryIconName, ComponentType<{ className?: string }>> = {
  query: Search,
  sale: Store,
  purchase: Truck,
  opname: ClipboardCheck,
  order: ShoppingCart,
  variant: Boxes,
  bundle: Layers,
  create: Plus,
  pandu: BrandMark,
  nav: Clock,
};

/** Which icon name to file an opened entry under (jump entries carry it explicitly). */
function paletteIconName(entry: RankedEntry): HistoryIconName {
  if (entry.iconName) return entry.iconName;
  if (entry.id.startsWith('create:')) return 'create';
  if (entry.id.startsWith('jump:sale:')) return 'sale';
  if (entry.id.startsWith('jump:purchase:')) return 'purchase';
  if (entry.id.startsWith('jump:opname:')) return 'opname';
  if (entry.id.startsWith('jump:order:')) return 'order';
  if (entry.id.startsWith('jump:variant:')) return 'variant';
  if (entry.id.startsWith('jump:bundle:')) return 'bundle';
  if (entry.id.startsWith('pandu:')) return 'pandu';
  return 'nav';
}

/** Map a stored recent to a palette row (a recent query re-runs; a destination opens). */
function toRecentEntry(recent: CommandHistoryEntry): RankedEntry {
  if (recent.kind === 'query') {
    return {
      id: recent.id,
      title: recent.text,
      hint: RECENTS_HINT,
      icon: HISTORY_ICONS.query,
      href: '#' as Route,
      searchable: toSearchable(recent.text, []),
      recentText: recent.text,
    };
  }
  return {
    id: recent.id,
    title: recent.title,
    hint: RECENTS_HINT,
    icon: HISTORY_ICONS[recent.iconName],
    href: recent.href as Route,
    searchable: toSearchable(recent.title, []),
    iconName: recent.iconName,
  };
}

function keywordFields(keywords: readonly string[] | undefined): SearchField[] {
  return (keywords ?? []).map((text) => ({ text, weight: KEYWORD_WEIGHT }));
}

const CREATE_ENTRIES: readonly PaletteEntry[] = CREATE_ACTIONS.map((action) => ({
  id: `create:${action.title}`,
  title: action.title,
  hint: 'Buat',
  icon: action.icon,
  href: action.href,
  searchable: toSearchable(action.title, [
    { text: 'buat', weight: KEYWORD_WEIGHT },
    ...keywordFields(action.keywords),
  ]),
  minRole: action.minRole,
  permission: action.permission,
}));

const NAV_ENTRIES: readonly PaletteEntry[] = sidebarNavSections.flatMap((section) =>
  section.items.map((item) => ({
    id: `nav:${item.href}`,
    title: item.title,
    hint: section.label ?? 'Menu',
    icon: item.icon,
    href: item.href,
    searchable: toSearchable(item.title, [
      ...keywordFields(item.keywords),
      ...(section.label ? [{ text: section.label, weight: SECTION_WEIGHT }] : []),
    ]),
    minRole: item.minRole,
    permission: item.permission,
  })),
);

const SUGGESTION_ENTRIES: readonly PaletteEntry[] = PANDU_SUGGESTIONS.map((suggestion) => ({
  id: `suggestion:${suggestion.href}`,
  title: suggestion.label,
  hint: 'Coba ini',
  icon: BrandMark,
  href: suggestion.href,
  searchable: toSearchable(suggestion.label, []),
}));

function buildEntries(
  query: string,
  role: OrgRole | null,
  permissions: readonly PermissionKey[] | null,
): readonly RankedEntry[] {
  // Role/permission-gated destinations drop out at render time (cosmetic — server still guards).
  const createEntries = CREATE_ENTRIES.filter((entry) => navItemAllowed(entry, role, permissions));
  const navEntries = NAV_ENTRIES.filter((entry) => navItemAllowed(entry, role, permissions));
  const trimmed = query.trim();

  if (!trimmed) {
    return [...createEntries, ...navEntries];
  }

  // Fuzzy-score every visible destination, then order by match quality. Ties
  // break to the shorter title, then to declaration order (create before nav),
  // so high-frequency rows stay where muscle memory expects them.
  const hits: RankedEntry[] = [...createEntries, ...navEntries]
    .map((entry, index) => ({ entry, match: scoreEntry(trimmed, entry.searchable), index }))
    .filter(
      (scored): scored is { entry: PaletteEntry; match: MatchResult; index: number } =>
        scored.match !== null,
    )
    .sort(
      (a, b) =>
        compareMatches(a.match, b.match) ||
        a.entry.title.length - b.entry.title.length ||
        a.index - b.index,
    )
    .slice(0, MAX_RANKED)
    .map(({ entry, match }) => ({ ...entry, match }));

  // Free text falls through Pandu's honest keyword router (navigate-only).
  const destination = routePanduQuery(query);
  if (destination && !hits.some((entry) => entry.href === destination.href)) {
    hits.push({
      id: `pandu:${destination.href}`,
      title: destination.label,
      hint: 'Pandu · Pratinjau',
      icon: BrandMark,
      href: destination.href,
      searchable: toSearchable(destination.label, []),
    });
  }

  return hits.length > 0 ? hits : SUGGESTION_ENTRIES;
}

/**
 * A query is a code candidate when it could be an entity code (no spaces,
 * 3–64 chars) and doesn't already match a menu/create entry — "produk" is a
 * menu word, "S00001" is a code.
 */
function toCodeCandidate(query: string): string {
  const trimmed = query.trim();
  if (!/^\S{3,64}$/.test(trimmed)) return '';

  const matchesMenu =
    CREATE_ENTRIES.some((entry) => scoreEntry(trimmed, entry.searchable) !== null) ||
    NAV_ENTRIES.some((entry) => scoreEntry(trimmed, entry.searchable) !== null);

  return matchesMenu ? '' : trimmed;
}

/** True when a wedge-scan's trailing Enter would land in a form field anyway. */
function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true;
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

type CommandPaletteContextValue = { open: () => void };

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within CommandPaletteProvider');
  }
  return context;
}

function PaletteDialog({
  open,
  onOpenChange,
  initialQuery,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled draft (a wedge-scanned code); '' for a fresh open. */
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const { org } = useOrg();
  const role = org?.role ?? null;
  const permissions = org?.permissions ?? null;

  const recents = useCommandHistoryStore((state) => state.recents);
  const recordQuery = useCommandHistoryStore((state) => state.recordQuery);
  const recordDestination = useCommandHistoryStore((state) => state.recordDestination);
  const clearHistory = useCommandHistoryStore((state) => state.clearHistory);

  // Persisted recents come from localStorage — render them only after mount so
  // the first client paint never disagrees with SSR.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Entity lookups fire only for code-looking queries (and only while open —
  // a closed palette never passes a candidate).
  const codeCandidate = open ? toCodeCandidate(query) : '';
  const { entries: jumpHits, isLooking } = useEntityJump(codeCandidate);

  const baseEntries = useMemo(
    () => buildEntries(query, role, permissions),
    [query, role, permissions],
  );

  // The "Terakhir" group leads the empty palette (returning-seller muscle
  // memory), with the full Buat/menu list directly below.
  const recentEntries = useMemo<readonly RankedEntry[]>(() => {
    if (query.trim() || !mounted) return [];
    return recents.map(toRecentEntry);
  }, [query, mounted, recents]);

  const entries = useMemo<readonly RankedEntry[]>(() => {
    if (jumpHits.length > 0) {
      const jumpEntries: RankedEntry[] = jumpHits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        hint: 'Data',
        icon: hit.icon,
        href: hit.href,
        searchable: toSearchable(hit.title, []),
      }));
      // A real record beats the "Pandu belum paham" suggestions — keep only
      // genuine nav/create hits below the jump group.
      const navHits = baseEntries === SUGGESTION_ENTRIES ? [] : baseEntries;
      return [...jumpEntries, ...navHits];
    }
    if (recentEntries.length > 0) return [...recentEntries, ...baseEntries];
    return baseEntries;
  }, [baseEntries, jumpHits, recentEntries]);

  const noDirectHit = entries === SUGGESTION_ENTRIES;
  const showJumpGroup = jumpHits.length > 0 || (isLooking && codeCandidate.length > 0);

  // Reset the draft whenever the palette opens fresh (or with a scanned code).
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setActiveIndex(0);
    }
  }, [open, initialQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, entries]);

  function run(entry: RankedEntry) {
    // A recalled search re-runs in place — no navigation, nothing to record.
    if (entry.recentText !== undefined) {
      setQuery(entry.recentText);
      setActiveIndex(0);
      return;
    }

    // Remember what worked: the destination, plus the query that surfaced it
    // (skip the suggestion fallbacks — they're guesses, not intent).
    if (!entry.id.startsWith('suggestion:')) {
      recordDestination({
        title: entry.title,
        href: entry.href,
        iconName: paletteIconName(entry),
      });
      const typed = query.trim();
      if (typed.length >= MIN_RECORDED_QUERY) recordQuery(typed);
    }

    onOpenChange(false);
    router.push(entry.href);
  }

  function handleClearHistory() {
    clearHistory();
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, entries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = entries[activeIndex];
      if (entry) run(entry);
    }
  }

  // Group rows under eyebrow headings while keeping ONE flat keyboard order.
  let lastHint: string | null = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-20 max-h-[min(560px,calc(100dvh-6rem))] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Cari &amp; perintah</DialogTitle>
        <DialogDescription className="sr-only">
          Cari menu, buat sesuatu, atau tempel kode penjualan, PO, opname, nomor resi, dan SKU —
          pilih dengan panah, buka dengan Enter.
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b py-2 pr-12 pl-4">
          <Search aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cari menu, kode (S…/PO…), resi, atau SKU…"
            aria-label="Cari menu atau perintah"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={
              entries[activeIndex] ? `palette-option-${entries[activeIndex].id}` : undefined
            }
            className="placeholder:text-muted-foreground h-10 w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div
          id="command-palette-list"
          role="listbox"
          aria-label="Hasil"
          className="max-h-[min(420px,60svh)] overflow-y-auto p-2"
        >
          {showJumpGroup ? (
            <>
              <p className="eyebrow text-muted-foreground px-3 pt-1 pb-1.5">Lompat ke</p>
              {isLooking ? (
                <p aria-live="polite" className="text-muted-foreground px-3 py-2 text-sm">
                  Mencari kode…
                </p>
              ) : null}
            </>
          ) : null}
          {noDirectHit ? (
            <p className="text-muted-foreground px-3 pt-2 pb-1 text-sm">
              Pandu belum paham yang itu — coba salah satu ini:
            </p>
          ) : null}
          {entries.map((entry, index) => {
            const Icon = entry.icon;
            const isActive = index === activeIndex;
            const showHeading = entry.hint !== lastHint && !query.trim() && !noDirectHit;
            lastHint = entry.hint;

            return (
              <div key={entry.id}>
                {showHeading ? (
                  entry.hint === RECENTS_HINT ? (
                    <div className="flex items-center justify-between px-3 pt-3 pb-1.5 first:pt-1">
                      <span className="eyebrow text-muted-foreground">{entry.hint}</span>
                      <button
                        type="button"
                        onClick={handleClearHistory}
                        className="text-muted-foreground hover:text-foreground text-[11px] transition-colors"
                      >
                        Bersihkan
                      </button>
                    </div>
                  ) : (
                    <p className="eyebrow text-muted-foreground px-3 pt-3 pb-1.5 first:pt-1">
                      {entry.hint}
                    </p>
                  )
                ) : null}
                <button
                  type="button"
                  id={`palette-option-${entry.id}`}
                  role="option"
                  aria-selected={isActive}
                  ref={isActive ? activeRef : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => run(entry)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-md',
                      entry.id.startsWith('create:')
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {entry.id.startsWith('create:') ? (
                      <Plus className="size-3.5" />
                    ) : (
                      <Icon className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {highlightSpans(entry.title, entry.match?.titleSpans ?? [])}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">{entry.hint}</span>
                  {isActive ? (
                    <CornerDownLeft
                      aria-hidden
                      className="text-muted-foreground size-3.5 shrink-0"
                    />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>

        <div className="text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-2 text-[11px]">
          <span>
            <kbd className="bg-muted rounded px-1 py-0.5 font-sans">↑↓</kbd> pilih ·{' '}
            <kbd className="bg-muted rounded px-1 py-0.5 font-sans">Enter</kbd> buka
          </span>
          <span>Pandu menjawab lewat navigasi — Pratinjau</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setInitialQuery('');
        setOpen((current) => !current);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Scan-wedge: a hardware scanner "types" the code faster than any human and
  // finishes with Enter. When that lands on chrome (palette closed, focus not
  // in a field, route not a scan-owning screen) open the palette pre-filled so
  // the entity lookups take it from there.
  useEffect(() => {
    if (open) return; // the palette's own input owns the keys while open

    let buffer = '';
    let lastKeyAt = 0;

    function onScanKey(event: KeyboardEvent) {
      if (event.isComposing) return;
      const now = Date.now();

      if (event.key === 'Enter') {
        const scanned = buffer;
        const gap = now - lastKeyAt;
        buffer = '';
        if (
          scanned.length >= 6 &&
          gap <= 100 &&
          !isEditableElement(document.activeElement) &&
          !isShellSuppressedRoute(pathname)
        ) {
          // Only the triggering Enter is swallowed; printable keys pass through.
          event.preventDefault();
          setInitialQuery(scanned);
          setOpen(true);
        }
        return;
      }

      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      // A human types slower than the wedge — any gap >50ms restarts the buffer.
      buffer = now - lastKeyAt <= 50 ? buffer + event.key : event.key;
      lastKeyAt = now;
    }

    document.addEventListener('keydown', onScanKey);
    return () => document.removeEventListener('keydown', onScanKey);
  }, [open, pathname]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      open: () => {
        setInitialQuery('');
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <PaletteDialog open={open} onOpenChange={setOpen} initialQuery={initialQuery} />
    </CommandPaletteContext.Provider>
  );
}

/**
 * The navbar trigger — looks like the search box every seller already knows;
 * teaches the shortcut on md+ the way Linear-style palettes do.
 */
export function CommandPaletteTrigger({ className }: { className?: string }) {
  const { open } = useCommandPalette();

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground focus-visible:ring-ring flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      <Search aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">Cari menu, resi, SKU…</span>
      <kbd className="bg-muted text-muted-foreground hidden rounded px-1.5 py-0.5 font-sans text-[10px] md:inline-block">
        Ctrl K
      </kbd>
    </button>
  );
}
