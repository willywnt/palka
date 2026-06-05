/** Server-side only (API routes + socket-server). Do not import from client components. */
import { timingSafeEqual } from 'crypto';

import type { PairingPurpose, PairingSession } from '@prisma/client';

import { createLogger } from '@olshop/logger/server';
import type { AuthUser } from '@/modules/auth/types';

const pairingLogger = createLogger({ component: 'pairing' });

import {
  PAIRING_CONNECTED_TTL_MS,
  PAIRING_PENDING_TTL_MS,
  SCANNER_HEARTBEAT_STALE_MS,
} from '../config';
import { PairingError, PAIRING_ERROR_CODES } from '../errors/pairing-errors';
import { pairingRepository } from '../repositories/pairing.repository';
import type { CreatePairingSessionResult, PairingSessionSummary } from '../types';
import { generatePairingCode, generatePairingSessionId } from '../utils/pairing-code';
import { toPairingSessionSummary } from '../utils/pairing-mapper';
import { resolveMobilePairingOrigin } from '../utils/resolve-public-origin';
import { clearScanDebounce, isDuplicateScan } from '../utils/scan-debounce';
import type { ConnectPairingInput } from '../validators/pairing';

function buildConnectUrl(pairingId: string, pairingCode: string): string {
  const origin = resolveMobilePairingOrigin();
  const params = new URLSearchParams({
    pairing: pairingId,
    code: pairingCode,
  });
  return `${origin}/mobile/connect?${params.toString()}`;
}

export class PairingService {
  async invalidateExpiredSessions(): Promise<number> {
    const count = await pairingRepository.expireStaleSessions();
    if (count > 0) {
      pairingLogger.info('pairing.sessions_expired', { count });
    }
    return count;
  }

  private assertOwnership(session: PairingSession, userId: string): void {
    if (session.userId !== userId) {
      throw PairingError.forbidden();
    }
  }

  private assertNotExpired(session: PairingSession): void {
    if (session.status === 'EXPIRED' || session.expiresAt <= new Date()) {
      throw PairingError.expired();
    }
  }

  async createSession(
    userId: string,
    purpose: PairingPurpose,
  ): Promise<CreatePairingSessionResult> {
    await this.invalidateExpiredSessions();

    // One active session per user: a new pairing (any purpose) supersedes the
    // previous one, so a phone is only ever driving one station at a time.
    const existing = await pairingRepository.findActiveByUserId(userId);
    if (existing) {
      await pairingRepository.expireSessionsForUser(userId);
      pairingLogger.info('pairing.previous_session_invalidated', {
        userId,
        previousSessionId: existing.id,
      });
    }

    const id = generatePairingSessionId();
    const pairingCode = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_PENDING_TTL_MS);

    const session = await pairingRepository.create({
      id,
      userId,
      pairingCode,
      purpose,
      expiresAt,
    });

    const connectUrl = buildConnectUrl(id, pairingCode);

    pairingLogger.info('pairing.created', {
      userId,
      pairingSessionId: id,
      purpose,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      session: toPairingSessionSummary(session),
      connectUrl,
      qrPayload: connectUrl,
    };
  }

  async getActiveSession(
    userId: string,
  ): Promise<{ session: PairingSessionSummary | null; connectUrl: string | null }> {
    await this.invalidateExpiredSessions();
    const session = await pairingRepository.findActiveByUserId(userId);
    if (!session) {
      return { session: null, connectUrl: null };
    }

    const summary = toPairingSessionSummary(session);
    const connectUrl = buildConnectUrl(session.id, session.pairingCode);
    return { session: summary, connectUrl };
  }

  /** Trust desktop pairing QR: sign the phone in as the session owner (no password). */
  async authorizeUserByPairingCode(pairingId: string, pairingCode: string): Promise<AuthUser> {
    await this.invalidateExpiredSessions();

    const session = await pairingRepository.findById(pairingId);
    if (!session) {
      throw PairingError.notFound();
    }

    this.assertNotExpired(session);

    if (!['PENDING', 'CONNECTED', 'DISCONNECTED'].includes(session.status)) {
      throw PairingError.expired();
    }

    const expected = Buffer.from(session.pairingCode);
    const provided = Buffer.from(pairingCode);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw PairingError.forbidden();
    }

    const user = await pairingRepository.findSessionUser(session.userId);

    if (!user) {
      throw PairingError.notFound();
    }

    pairingLogger.info('pairing.mobile_auto_sign_in', {
      userId: user.id,
      pairingSessionId: session.id,
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    };
  }

  async getSessionForUser(userId: string, pairingId: string): Promise<PairingSessionSummary> {
    await this.invalidateExpiredSessions();
    const session = await pairingRepository.findById(pairingId);
    if (!session) throw PairingError.notFound();
    this.assertOwnership(session, userId);
    return toPairingSessionSummary(session);
  }

  async connectMobile(userId: string, input: ConnectPairingInput): Promise<PairingSessionSummary> {
    await this.invalidateExpiredSessions();

    const session = await pairingRepository.findById(input.pairingId);
    if (!session) throw PairingError.notFound();
    this.assertOwnership(session, userId);
    this.assertNotExpired(session);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_CONNECTED_TTL_MS);
    const deviceInfo = input.deviceInfo ?? {};

    if (session.status === 'CONNECTED') {
      const updated = await pairingRepository.touchHeartbeat(session.id, expiresAt);
      pairingLogger.info('pairing.reconnected', {
        userId,
        pairingSessionId: session.id,
        reason: 'already_connected',
      });
      return toPairingSessionSummary(updated);
    }

    if (session.status === 'DISCONNECTED') {
      const reconnected = await pairingRepository.markConnected(session.id, {
        connectedAt: session.connectedAt ?? now,
        lastSeenAt: now,
        expiresAt,
        deviceInfo,
      });

      pairingLogger.info('pairing.reconnected', {
        userId,
        pairingSessionId: session.id,
        reason: 'after_disconnect',
      });

      return toPairingSessionSummary(reconnected);
    }

    if (session.status === 'EXPIRED') {
      throw PairingError.expired();
    }

    if (session.status !== 'PENDING') {
      throw PairingError.expired();
    }

    const connected = await pairingRepository.markConnected(session.id, {
      connectedAt: now,
      lastSeenAt: now,
      expiresAt,
      deviceInfo,
    });

    await pairingRepository.expireSessionsForUser(userId, session.id);

    pairingLogger.info('pairing.connected', {
      userId,
      pairingSessionId: session.id,
      deviceInfo,
    });

    return toPairingSessionSummary(connected);
  }

  async recordHeartbeat(userId: string, pairingId: string): Promise<PairingSessionSummary> {
    const session = await pairingRepository.findById(pairingId);
    if (!session) throw PairingError.notFound();
    this.assertOwnership(session, userId);

    if (session.status !== 'CONNECTED') {
      throw PairingError.notConnected();
    }

    this.assertNotExpired(session);

    const expiresAt = new Date(Date.now() + PAIRING_CONNECTED_TTL_MS);
    const updated = await pairingRepository.touchHeartbeat(session.id, expiresAt);
    return toPairingSessionSummary(updated);
  }

  async assertSocketJoin(
    userId: string,
    pairingId: string,
    role: 'desktop' | 'mobile',
  ): Promise<PairingSessionSummary> {
    await this.invalidateExpiredSessions();
    const session = await pairingRepository.findById(pairingId);
    if (!session) throw PairingError.notFound();
    this.assertOwnership(session, userId);
    this.assertNotExpired(session);

    if (role === 'mobile' && session.status !== 'CONNECTED') {
      throw PairingError.notConnected();
    }

    if (role === 'desktop' && !['PENDING', 'CONNECTED', 'DISCONNECTED'].includes(session.status)) {
      throw PairingError.expired();
    }

    return toPairingSessionSummary(session);
  }

  async submitBarcode(
    userId: string,
    pairingId: string,
    rawBarcode: string,
  ): Promise<{ barcode: string; session: PairingSessionSummary }> {
    const session = await pairingRepository.findById(pairingId);
    if (!session) throw PairingError.notFound();
    this.assertOwnership(session, userId);

    if (session.status !== 'CONNECTED') {
      throw PairingError.notConnected();
    }

    this.assertNotExpired(session);

    const lastSeen = session.lastSeenAt?.getTime() ?? session.connectedAt?.getTime() ?? 0;
    if (Date.now() - lastSeen > SCANNER_HEARTBEAT_STALE_MS) {
      await pairingRepository.disconnect(session.id);
      pairingLogger.warn('pairing.scanner_stale_disconnect', {
        userId,
        pairingSessionId: pairingId,
      });
      throw new PairingError(PAIRING_ERROR_CODES.SCANNER_DISCONNECTED);
    }

    // Stored/relayed verbatim (just trimmed) — see scannedCodeSchema.
    const barcode = rawBarcode.trim();

    // A POS pairing may legitimately re-scan the same product to add another unit;
    // only recordings dedupes (to avoid double-triggering a recording for one resi).
    if (session.purpose === 'RECORDING' && isDuplicateScan(pairingId, barcode)) {
      throw PairingError.duplicateScan();
    }

    const updated = await pairingRepository.recordScan(session.id, barcode);

    pairingLogger.info('pairing.barcode_scanned', {
      userId,
      pairingSessionId: pairingId,
      barcode,
    });

    return {
      barcode,
      session: toPairingSessionSummary(updated),
    };
  }

  async disconnect(userId: string, pairingId: string): Promise<PairingSessionSummary> {
    const session = await pairingRepository.findById(pairingId);
    if (!session) throw PairingError.notFound();
    this.assertOwnership(session, userId);

    clearScanDebounce(pairingId);
    const updated = await pairingRepository.disconnect(session.id);

    pairingLogger.info('pairing.disconnected', {
      userId,
      pairingSessionId: pairingId,
      previousStatus: session.status,
    });

    return toPairingSessionSummary(updated);
  }

  async markScannerStale(pairingId: string): Promise<void> {
    const session = await pairingRepository.findById(pairingId);
    if (!session || session.status !== 'CONNECTED') return;

    const lastSeen = session.lastSeenAt?.getTime() ?? 0;
    if (Date.now() - lastSeen <= SCANNER_HEARTBEAT_STALE_MS) return;

    await pairingRepository.disconnect(session.id);
    clearScanDebounce(pairingId);

    pairingLogger.info('pairing.scanner_heartbeat_lost', {
      pairingSessionId: pairingId,
      userId: session.userId,
    });
  }
}

export const pairingService = new PairingService();
