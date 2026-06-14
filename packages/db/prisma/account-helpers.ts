import { OrgRole } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { DEFAULT_STORAGE_QUOTA_BYTES } from '@falka/config/limits';
import argon2 from 'argon2';

/** Argon2id hash with the same cost params the app uses for login. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Ensure the user owns an organization (id := user.id — the same identity the
 * backfill migration uses, so storage-key prefixes stay valid) and holds OWNER in it.
 * Idempotent. Shared by the dev seed and the production admin bootstrap.
 */
export async function ensureOwnOrganization(
  prisma: PrismaClient,
  user: { id: string; displayName: string | null },
) {
  const organization = await prisma.organization.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      name: user.displayName ?? 'Toko demo',
      storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
    },
  });

  await prisma.organizationMember.upsert({
    where: { userId: user.id },
    update: { role: OrgRole.OWNER },
    create: { organizationId: organization.id, userId: user.id, role: OrgRole.OWNER },
  });

  return organization;
}
