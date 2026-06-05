'use client';

import { useEffect, useState } from 'react';

import { unlockScanSound } from '@/lib/scan-sound';

/**
 * Per-station scan-sound preference (default on), persisted under `storageKey`.
 * Toggling also unlocks Web Audio from the click so the next beep can play.
 */
export function useScanSoundPref(storageKey: string): {
  soundOn: boolean;
  toggleSound: () => void;
} {
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === 'off') setSoundOn(false);
    } catch {
      // localStorage may be unavailable (private mode) — keep the default.
    }
  }, [storageKey]);

  function toggleSound() {
    unlockScanSound();
    setSoundOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? 'on' : 'off');
      } catch {
        // ignore storage write errors
      }
      return next;
    });
  }

  return { soundOn, toggleSound };
}
