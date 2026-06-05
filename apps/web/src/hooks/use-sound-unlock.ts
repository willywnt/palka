'use client';

import { useEffect } from 'react';

import { unlockScanSound } from '@/lib/scan-sound';

/**
 * Unlock Web Audio on the first user gesture on the page, so later socket-driven
 * beeps (scan success, countdown ticks) are allowed to play even when no button
 * was clicked right before them.
 */
export function useSoundUnlock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = () => unlockScanSound();
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });

    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [enabled]);
}
