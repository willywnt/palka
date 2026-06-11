import { afterEach, describe, expect, it } from 'vitest';

import { formatScannerSocketError } from '@/modules/scanner-pairing/services/socket-client.service';

const DEV_HINTS = /dev:web|PC dev server|HTTPS certificate/i;

/**
 * The realtime connection fails differently in dev (same-origin custom server) vs
 * production (a separate socket host over the internet). These pin that the dev-only
 * hints never leak into production messages — the bug that surfaced "Check Wi‑Fi and
 * that the PC dev server is still running" to a production phone.
 */
describe('formatScannerSocketError', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
  });

  describe('local dev (no NEXT_PUBLIC_SOCKET_URL)', () => {
    it('gives the dev:web hint for a polling error', () => {
      expect(formatScannerSocketError(new Error('xhr poll error'))).toContain('dev:web');
    });

    it('names the PC dev server for a websocket error', () => {
      expect(formatScannerSocketError(new Error('websocket error'))).toContain('PC dev server');
    });

    it('gives the dev:web hint for a timeout', () => {
      expect(formatScannerSocketError(new Error('socket timeout'))).toContain('dev:web');
    });
  });

  describe('production (separate socket host configured)', () => {
    const inProd = (error: Error) => {
      process.env.NEXT_PUBLIC_SOCKET_URL = 'https://socket.example.com';
      return formatScannerSocketError(error);
    };

    it('does not leak dev hints for a polling error', () => {
      const msg = inProd(new Error('xhr poll error'));
      expect(msg).not.toMatch(DEV_HINTS);
      expect(msg).toContain('Server rekaman');
    });

    it('does not leak dev hints for a websocket error', () => {
      expect(inProd(new Error('websocket error'))).not.toMatch(DEV_HINTS);
    });

    it('does not leak dev hints for a timeout', () => {
      expect(inProd(new Error('socket timeout'))).not.toMatch(DEV_HINTS);
    });
  });
});
