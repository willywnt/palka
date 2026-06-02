import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RECORDING_ERROR_CODES } from '@/modules/recordings/errors/recording-errors';

/**
 * Happy Flow #1 — server-side invariants for starting and completing a recording.
 * Prisma and the storage/quota collaborators are mocked; this guards the business
 * rules (no concurrent recording, quota gating, upload-ownership checks, and the
 * quota-incrementing completion transaction) without touching a real database.
 */

type TxClient = {
  recording: { update: ReturnType<typeof vi.fn> };
  user: { update: ReturnType<typeof vi.fn> };
};

const { prismaMock, txMock, quotaMock } = vi.hoisted(() => {
  const txMock: TxClient = {
    recording: { update: vi.fn() },
    user: { update: vi.fn() },
  };
  return {
    txMock,
    prismaMock: {
      recording: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      user: { update: vi.fn() },
      $transaction: vi.fn((cb: (tx: TxClient) => Promise<unknown>) => cb(txMock)),
    },
    quotaMock: {
      getQuotaSnapshot: vi.fn(),
      assertQuotaAvailable: vi.fn(),
    },
  };
});

vi.mock('@olshop/db', () => ({ prisma: prismaMock, buildPaginatedResult: vi.fn() }));
vi.mock('@olshop/config/env.server', () => ({
  getServerEnv: () => ({ R2_BUCKET_NAME: 'test-bucket' }),
}));
vi.mock('@/modules/storage/services/quota.service', () => ({ quotaService: quotaMock }));
vi.mock('@/modules/storage/services/storage.service', () => ({
  storageService: { deleteObject: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Imported after the mocks are registered.
const { RecordingServerService } =
  await import('@/modules/recordings/services/recording-server.service');

const service = new RecordingServerService();
const USER = 'user-1';

beforeEach(() => {
  quotaMock.getQuotaSnapshot.mockResolvedValue({ remainingBytes: BigInt(10_000) });
  quotaMock.assertQuotaAvailable.mockResolvedValue(undefined);
});

describe('startRecording', () => {
  it('rejects when an active recording already exists', async () => {
    prismaMock.recording.findFirst.mockResolvedValue({ id: 'active-1' });

    await expect(service.startRecording(USER, 'RESI123')).rejects.toMatchObject({
      code: RECORDING_ERROR_CODES.ACTIVE_RECORDING_EXISTS,
    });
    expect(prismaMock.recording.create).not.toHaveBeenCalled();
  });

  it('rejects when the storage quota is exhausted', async () => {
    prismaMock.recording.findFirst.mockResolvedValue(null);
    quotaMock.getQuotaSnapshot.mockResolvedValue({ remainingBytes: BigInt(0) });

    await expect(service.startRecording(USER, 'RESI123')).rejects.toMatchObject({
      code: RECORDING_ERROR_CODES.QUOTA_EXCEEDED,
    });
    expect(prismaMock.recording.create).not.toHaveBeenCalled();
  });

  it('creates a RECORDING row with a user-scoped pending key and returns its id', async () => {
    prismaMock.recording.findFirst.mockResolvedValue(null);
    prismaMock.recording.create.mockResolvedValue({
      id: 'rec-1',
      noResi: 'RESI123',
      startedAt: new Date('2026-06-02T08:00:00.000Z'),
    });

    const result = await service.startRecording(USER, 'RESI123');

    expect(result).toEqual({
      recordingId: 'rec-1',
      noResi: 'RESI123',
      startedAt: '2026-06-02T08:00:00.000Z',
    });

    const createArgs = prismaMock.recording.create.mock.calls[0]?.[0] as {
      data: { status: string; storageKey: string; userId: string };
    };
    expect(createArgs.data.status).toBe('RECORDING');
    expect(createArgs.data.userId).toBe(USER);
    expect(createArgs.data.storageKey.startsWith(`pending/${USER}/`)).toBe(true);
  });
});

describe('completeRecording', () => {
  const baseInput = {
    recordingId: 'rec-1',
    noResi: 'RESI123',
    storageKey: `recordings/${USER}/2026/06/rec_x.webm`,
    publicUrl: 'https://cdn.example/rec_x.webm',
    mimeType: 'video/webm',
    fileSizeBytes: 1_000,
    durationSeconds: 5,
  };

  it('rejects a storage key that does not belong to the caller', async () => {
    await expect(
      service.completeRecording(USER, { ...baseInput, storageKey: 'recordings/other/rec.webm' }),
    ).rejects.toMatchObject({ code: RECORDING_ERROR_CODES.VALIDATION_ERROR });
  });

  it('rejects an unsupported MIME type', async () => {
    await expect(
      service.completeRecording(USER, { ...baseInput, mimeType: 'video/mp4' }),
    ).rejects.toMatchObject({ code: RECORDING_ERROR_CODES.VALIDATION_ERROR });
  });

  it('rejects a non-positive file size', async () => {
    await expect(
      service.completeRecording(USER, { ...baseInput, fileSizeBytes: 0 }),
    ).rejects.toMatchObject({ code: RECORDING_ERROR_CODES.VALIDATION_ERROR });
  });

  it('marks the recording COMPLETED and increments user storage in one transaction', async () => {
    prismaMock.recording.findFirst.mockResolvedValue({
      id: 'rec-1',
      noResi: 'RESI123',
      status: 'RECORDING',
    });
    prismaMock.recording.findUnique.mockResolvedValue(null);
    txMock.recording.update.mockResolvedValue({
      id: 'rec-1',
      noResi: 'RESI123',
      status: 'COMPLETED',
      publicUrl: baseInput.publicUrl,
      storageKey: baseInput.storageKey,
      fileSizeBytes: BigInt(1_000),
      durationSeconds: 5,
    });
    txMock.user.update.mockResolvedValue({ id: USER });

    const result = await service.completeRecording(USER, baseInput);

    expect(result.status).toBe('COMPLETED');
    expect(result.fileSizeBytes).toBe(1_000);
    expect(quotaMock.assertQuotaAvailable).toHaveBeenCalledWith(USER, 1_000);

    const userUpdateArgs = txMock.user.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { storageUsedBytes: { increment: bigint } };
    };
    expect(userUpdateArgs.where.id).toBe(USER);
    expect(userUpdateArgs.data.storageUsedBytes.increment).toBe(BigInt(1_000));
  });
});
