'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Pandu UI state (client-only — rule §6): which nudges the user dismissed.
 * Nudge ids embed their underlying datum, so a dismissal re-arms naturally
 * when the number changes (e.g. urgent count 2 → 3 is a new id).
 */
type PanduState = {
  dismissedNudgeIds: string[];
  dismissNudge: (id: string) => void;
};

const MAX_REMEMBERED = 50;

export const usePanduStore = create<PanduState>()(
  persist(
    (set) => ({
      dismissedNudgeIds: [],
      dismissNudge: (id) =>
        set((state) => ({
          dismissedNudgeIds: [...state.dismissedNudgeIds.filter((x) => x !== id), id].slice(
            -MAX_REMEMBERED,
          ),
        })),
    }),
    { name: 'falka-pandu' },
  ),
);
