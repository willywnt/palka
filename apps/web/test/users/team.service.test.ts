import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Team service authority + invariants, with Prisma and the audit/retry helpers
 * mocked: an ADMIN may only mint STAFF invites (OWNER mints either), and the
 * OWNER membership row is immutable through role-change / removal.
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    organizationInvite: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    organizationMember: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('@falka/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/db-retry', () => ({
  // Run the thunk once (no collision in tests).
  retryOnCodeCollision: (run: () => unknown) => run(),
}));
vi.mock('@/modules/audit/services/audit.service', () => ({
  auditService: { log: vi.fn() },
}));

const { TeamService } = await import('@/modules/users/services/team.service');

const service = new TeamService();
const ORG = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.organizationInvite.create.mockResolvedValue({
    id: 'inv-1',
    code: 'ABCD2345',
    role: 'STAFF',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-06-13T00:00:00.000Z'),
  });
});

describe('createInvite', () => {
  it('lets an OWNER mint an ADMIN invite', async () => {
    prismaMock.organizationInvite.create.mockResolvedValueOnce({
      id: 'inv-2',
      code: 'WXYZ2345',
      role: 'ADMIN',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-06-13T00:00:00.000Z'),
    });

    const invite = await service.createInvite(ORG, { userId: 'u-owner', role: 'OWNER' }, 'ADMIN');

    expect(invite.role).toBe('ADMIN');
    expect(prismaMock.organizationInvite.create).toHaveBeenCalledTimes(1);
  });

  it('refuses an ADMIN actor minting an ADMIN invite', async () => {
    await expect(
      service.createInvite(ORG, { userId: 'u-admin', role: 'ADMIN' }, 'ADMIN'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.organizationInvite.create).not.toHaveBeenCalled();
  });

  it('lets an ADMIN actor mint a STAFF invite', async () => {
    const invite = await service.createInvite(ORG, { userId: 'u-admin', role: 'ADMIN' }, 'STAFF');
    expect(invite.role).toBe('STAFF');
    expect(prismaMock.organizationInvite.create).toHaveBeenCalledTimes(1);
  });
});

describe('member mutations', () => {
  it('refuses to change the OWNER row', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValue({ role: 'OWNER' });

    await expect(
      service.updateMemberRole(ORG, 'u-owner', 'u-owner', 'ADMIN'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prismaMock.organizationMember.update).not.toHaveBeenCalled();
  });

  it('refuses to remove the OWNER row', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValue({ role: 'OWNER' });

    await expect(service.removeMember(ORG, 'u-owner', 'u-owner')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(prismaMock.organizationMember.delete).not.toHaveBeenCalled();
  });

  it('changes a STAFF member to ADMIN', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValue({ role: 'STAFF' });

    await service.updateMemberRole(ORG, 'u-owner', 'u-staff', 'ADMIN');

    expect(prismaMock.organizationMember.update).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: ORG, userId: 'u-staff' } },
      data: { role: 'ADMIN' },
    });
  });

  it('throws not-found for an unknown member', async () => {
    prismaMock.organizationMember.findUnique.mockResolvedValue(null);

    await expect(service.removeMember(ORG, 'u-owner', 'ghost')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('revokeInvite', () => {
  it('refuses to revoke an already-used invite', async () => {
    prismaMock.organizationInvite.findFirst.mockResolvedValue({
      id: 'inv-1',
      usedAt: new Date(),
      revokedAt: null,
    });

    await expect(service.revokeInvite(ORG, 'u-admin', 'inv-1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(prismaMock.organizationInvite.update).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-revoked invite', async () => {
    prismaMock.organizationInvite.findFirst.mockResolvedValue({
      id: 'inv-1',
      usedAt: null,
      revokedAt: new Date(),
    });

    await expect(service.revokeInvite(ORG, 'u-admin', 'inv-1')).resolves.toBeUndefined();
    expect(prismaMock.organizationInvite.update).not.toHaveBeenCalled();
  });
});
