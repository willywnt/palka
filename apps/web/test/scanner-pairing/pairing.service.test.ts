import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PairingSession } from '@prisma/client';

import { PAIRING_ERROR_CODES } from '@/modules/scanner-pairing/errors/pairing-errors';

/**
 * Happy Flow #2 — server-side pairing invariants: QR auto-sign-in, mobile connect
 * state machine, and barcode submission. The repository and Prisma are mocked; the
 * timing-safe code comparison and scan de-duplication run for real.
 */

const { repoMock } = vi.hoisted(() => ({
  repoMock: {
    expireStaleSessions: vi.fn(),
    findActiveByUserId: vi.fn(),
    expireSessionsForUser: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    touchHeartbeat: vi.fn(),
    markConnected: vi.fn(),
    recordScan: vi.fn(),
    disconnect: vi.fn(),
    findSessionUser: vi.fn(),
  },
}));

vi.mock('@/modules/scanner-pairing/repositories/pairing.repository', () => ({
  pairingRepository: repoMock,
}));
vi.mock('@olshop/logger/server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { PairingService } = await import('@/modules/scanner-pairing/services/pairing.service');

const service = new PairingService();
const USER = 'user-1';
const PAIRING_CODE = 'abcdef0123456789'; // 16 chars

function fakeSession(overrides: Partial<PairingSession> = {}): PairingSession {
  return {
    id: 'pair-1',
    userId: USER,
    pairingCode: PAIRING_CODE,
    status: 'PENDING',
    purpose: 'RECORDING',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    connectedAt: null,
    lastSeenAt: null,
    lastScanAt: null,
    lastBarcode: null,
    deviceInfo: null,
    createdAt: new Date('2026-06-02T08:00:00.000Z'),
    ...overrides,
  } as unknown as PairingSession;
}

beforeEach(() => {
  repoMock.expireStaleSessions.mockResolvedValue(0);
  repoMock.expireSessionsForUser.mockResolvedValue(0);
});

describe('authorizeUserByPairingCode', () => {
  it('rejects when the session does not exist', async () => {
    repoMock.findById.mockResolvedValue(null);

    await expect(service.authorizeUserByPairingCode('pair-1', PAIRING_CODE)).rejects.toMatchObject({
      code: PAIRING_ERROR_CODES.PAIRING_NOT_FOUND,
    });
  });

  it('rejects a wrong pairing code (timing-safe mismatch)', async () => {
    repoMock.findById.mockResolvedValue(fakeSession({ status: 'PENDING' }));

    await expect(
      service.authorizeUserByPairingCode('pair-1', 'wrongwrongwrong0'),
    ).rejects.toMatchObject({ code: PAIRING_ERROR_CODES.PAIRING_FORBIDDEN });
    expect(repoMock.findSessionUser).not.toHaveBeenCalled();
  });

  it('signs in the session owner when the code matches', async () => {
    repoMock.findById.mockResolvedValue(fakeSession({ status: 'PENDING' }));
    repoMock.findSessionUser.mockResolvedValue({
      id: USER,
      email: 'owner@example.com',
      role: 'USER',
      displayName: 'Owner',
    });

    const user = await service.authorizeUserByPairingCode('pair-1', PAIRING_CODE);

    expect(user).toEqual({
      id: USER,
      email: 'owner@example.com',
      role: 'USER',
      displayName: 'Owner',
    });
  });
});

describe('connectMobile', () => {
  it('connects a PENDING session and invalidates the user other sessions', async () => {
    repoMock.findById.mockResolvedValue(fakeSession({ status: 'PENDING' }));
    repoMock.markConnected.mockResolvedValue(
      fakeSession({ status: 'CONNECTED', connectedAt: new Date('2026-06-02T08:05:00.000Z') }),
    );

    const summary = await service.connectMobile(USER, { pairingId: 'pair-1' });

    expect(summary.status).toBe('CONNECTED');
    expect(repoMock.markConnected).toHaveBeenCalledTimes(1);
    expect(repoMock.expireSessionsForUser).toHaveBeenCalledWith(USER, 'pair-1');
  });

  it('rejects connecting a session owned by another user', async () => {
    repoMock.findById.mockResolvedValue(fakeSession({ userId: 'someone-else', status: 'PENDING' }));

    await expect(service.connectMobile(USER, { pairingId: 'pair-1' })).rejects.toMatchObject({
      code: PAIRING_ERROR_CODES.PAIRING_FORBIDDEN,
    });
    expect(repoMock.markConnected).not.toHaveBeenCalled();
  });

  it('rejects connecting an expired session', async () => {
    repoMock.findById.mockResolvedValue(fakeSession({ status: 'EXPIRED' }));

    await expect(service.connectMobile(USER, { pairingId: 'pair-1' })).rejects.toMatchObject({
      code: PAIRING_ERROR_CODES.PAIRING_EXPIRED,
    });
  });
});

describe('submitBarcode', () => {
  it('rejects a scan when the mobile is not connected', async () => {
    repoMock.findById.mockResolvedValue(fakeSession({ id: 'pair-nc', status: 'PENDING' }));

    await expect(service.submitBarcode(USER, 'pair-nc', 'JNE123')).rejects.toMatchObject({
      code: PAIRING_ERROR_CODES.PAIRING_NOT_CONNECTED,
    });
  });

  it('records the first scan verbatim (trimmed), then debounces an immediate re-scan', async () => {
    const connected = fakeSession({
      id: 'pair-bc',
      status: 'CONNECTED',
      connectedAt: new Date(),
      lastSeenAt: new Date(),
    });
    repoMock.findById.mockResolvedValue(connected);
    repoMock.recordScan.mockResolvedValue(
      fakeSession({ id: 'pair-bc', status: 'CONNECTED', lastBarcode: 'jne 123' }),
    );

    // No uppercasing / whitespace stripping — only the outer whitespace is trimmed.
    const first = await service.submitBarcode(USER, 'pair-bc', '  jne 123  ');
    expect(first.barcode).toBe('jne 123');
    expect(repoMock.recordScan).toHaveBeenCalledWith('pair-bc', 'jne 123');

    await expect(service.submitBarcode(USER, 'pair-bc', 'jne 123')).rejects.toMatchObject({
      code: PAIRING_ERROR_CODES.DUPLICATE_SCAN,
    });
  });

  it('does not dedupe re-scans on a POS pairing (each scan adds a unit)', async () => {
    const connected = fakeSession({
      id: 'pair-pos',
      status: 'CONNECTED',
      purpose: 'POS',
      connectedAt: new Date(),
      lastSeenAt: new Date(),
    });
    repoMock.findById.mockResolvedValue(connected);
    repoMock.recordScan.mockResolvedValue(
      fakeSession({ id: 'pair-pos', status: 'CONNECTED', purpose: 'POS', lastBarcode: 'BLACK-S' }),
    );

    const first = await service.submitBarcode(USER, 'pair-pos', 'BLACK-S');
    expect(first.barcode).toBe('BLACK-S');

    // Same code again — POS allows it (no DUPLICATE_SCAN), so 2 units can be rung up.
    const second = await service.submitBarcode(USER, 'pair-pos', 'BLACK-S');
    expect(second.barcode).toBe('BLACK-S');
    expect(repoMock.recordScan).toHaveBeenCalledTimes(2);
  });
});
