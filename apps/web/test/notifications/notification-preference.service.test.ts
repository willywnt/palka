import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Notification preference service (Phase 3), Prisma mocked. Guards: getPreferences
 * returns every category with a default-on state (missing row ⇒ enabled), mutedCategories
 * lists only the opted-out ones, and setPreference upserts the IN_APP row.
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    notificationPreference: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('@falka/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { NotificationPreferenceService } =
  await import('@/modules/notifications/services/notification-preference.service');

const service = new NotificationPreferenceService();
const ORG = 'org-1';
const USER = 'user-1';

beforeEach(() => {
  prismaMock.notificationPreference.findMany.mockResolvedValue([]);
  prismaMock.notificationPreference.upsert.mockResolvedValue({});
});

describe('getPreferences', () => {
  it('returns every category, defaulting to enabled when no row exists', async () => {
    prismaMock.notificationPreference.findMany.mockResolvedValue([]);

    const prefs = await service.getPreferences(ORG, USER);

    expect(prefs.length).toBe(8); // the 8 NotificationCategory values
    expect(prefs.every((pref) => pref.enabled)).toBe(true);
    expect(prefs.map((pref) => pref.category)).toContain('INVENTORY');
  });

  it('reflects a stored opt-out (enabled:false) while the rest stay on', async () => {
    prismaMock.notificationPreference.findMany.mockResolvedValue([
      { category: 'INVENTORY', enabled: false },
    ]);

    const prefs = await service.getPreferences(ORG, USER);

    expect(prefs.find((pref) => pref.category === 'INVENTORY')?.enabled).toBe(false);
    expect(prefs.find((pref) => pref.category === 'ORDERS')?.enabled).toBe(true);
  });
});

describe('mutedCategories', () => {
  it('lists only the categories the member turned off', async () => {
    prismaMock.notificationPreference.findMany.mockResolvedValue([{ category: 'SALES' }]);

    const muted = await service.mutedCategories(ORG, USER);

    expect(muted).toEqual(['SALES']);
    // Queried for this member's disabled IN_APP rows only.
    const where = prismaMock.notificationPreference.findMany.mock.calls[0]?.[0] as {
      where: { organizationId: string; userId: string; channel: string; enabled: boolean };
    };
    expect(where.where).toMatchObject({
      organizationId: ORG,
      userId: USER,
      channel: 'IN_APP',
      enabled: false,
    });
  });
});

describe('setPreference', () => {
  it('upserts the IN_APP row by the compound unique', async () => {
    await service.setPreference(ORG, USER, 'PURCHASING', false);

    const args = prismaMock.notificationPreference.upsert.mock.calls[0]?.[0] as {
      where: { organizationId_userId_category_channel: Record<string, unknown> };
      create: { enabled: boolean; channel: string };
      update: { enabled: boolean };
    };
    expect(args.where.organizationId_userId_category_channel).toEqual({
      organizationId: ORG,
      userId: USER,
      category: 'PURCHASING',
      channel: 'IN_APP',
    });
    expect(args.create).toMatchObject({ enabled: false, channel: 'IN_APP' });
    expect(args.update).toEqual({ enabled: false });
  });
});
