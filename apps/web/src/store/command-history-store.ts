'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Command-palette history (client-only — rule §6): the last few searches the
 * user typed AND the destinations they opened, surfaced as a "Terakhir" group
 * when the palette opens empty. Serializable only — a destination stores its
 * label + href + an icon NAME (resolved to a component at render), never a live
 * record or a component reference. Per-browser, capped, most-recent-first.
 */

/** Stable icon key for a recalled destination (resolved to a component in the palette). */
export type HistoryIconName =
  | 'query'
  | 'sale'
  | 'purchase'
  | 'opname'
  | 'order'
  | 'variant'
  | 'bundle'
  | 'create'
  | 'pandu'
  | 'nav';

export interface QueryHistoryEntry {
  readonly kind: 'query';
  /** `q:<lowercased text>` — dedupe key. */
  readonly id: string;
  readonly text: string;
}

export interface DestinationHistoryEntry {
  readonly kind: 'destination';
  /** The href — also the dedupe key (re-opening a page refreshes its recency). */
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly iconName: HistoryIconName;
}

export type CommandHistoryEntry = QueryHistoryEntry | DestinationHistoryEntry;

type CommandHistoryState = {
  recents: CommandHistoryEntry[];
  recordQuery: (text: string) => void;
  recordDestination: (entry: Omit<DestinationHistoryEntry, 'kind' | 'id'>) => void;
  removeRecent: (id: string) => void;
  clearHistory: () => void;
};

const MAX_RECENTS = 8;
const MIN_QUERY_LENGTH = 2;

/** Move-to-front by id, then cap — the classic MRU list. */
function prependUnique(
  recents: readonly CommandHistoryEntry[],
  entry: CommandHistoryEntry,
): CommandHistoryEntry[] {
  return [entry, ...recents.filter((existing) => existing.id !== entry.id)].slice(0, MAX_RECENTS);
}

export const useCommandHistoryStore = create<CommandHistoryState>()(
  persist(
    (set) => ({
      recents: [],
      recordQuery: (text) =>
        set((state) => {
          const trimmed = text.trim();
          if (trimmed.length < MIN_QUERY_LENGTH) return state;
          const entry: QueryHistoryEntry = {
            kind: 'query',
            id: `q:${trimmed.toLowerCase()}`,
            text: trimmed,
          };
          return { recents: prependUnique(state.recents, entry) };
        }),
      recordDestination: (input) =>
        set((state) => {
          const entry: DestinationHistoryEntry = { kind: 'destination', id: input.href, ...input };
          return { recents: prependUnique(state.recents, entry) };
        }),
      removeRecent: (id) =>
        set((state) => ({ recents: state.recents.filter((entry) => entry.id !== id) })),
      clearHistory: () => set({ recents: [] }),
    }),
    { name: 'falka-command-history' },
  ),
);
