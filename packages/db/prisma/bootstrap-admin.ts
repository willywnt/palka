import { PrismaClient, UserRole } from '@prisma/client';

import { ensureOwnOrganization, hashPassword } from './account-helpers';

/**
 * Production bootstrap for a FRESH database. The deploy only runs `migrate`, so an empty
 * prod DB has no platform admin and no organization — and registration is invite-only with
 * orgs provisioned solely via `/admin`, which itself needs a platform admin to sign in.
 * This one-shot mints exactly that first platform admin (UserRole.ADMIN) + its own org, and
 * NOTHING else (no demo data). The operator then signs in at `/admin` to provision the first
 * shop org + owner. Idempotent and non-destructive: an existing account is never overwritten.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=ops@yourco.com BOOTSTRAP_ADMIN_PASSWORD='<strong>' \
 *     pnpm --filter @falka/db db:bootstrap-admin
 */

const prisma = new PrismaClient();

const EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 12;
const WEAK_PASSWORDS = new Set([
  'admin123!',
  'password',
  'password1',
  'changeme',
  'changeme123',
  'falka123!',
  'qwerty123',
]);

function fail(message: string): never {
  console.error(`Bootstrap aborted: ${message}`);
  process.exit(1);
}

function requireStrongPassword(value: string | undefined): string {
  if (!value) fail('BOOTSTRAP_ADMIN_PASSWORD is required.');
  if (value.length < MIN_PASSWORD_LENGTH) {
    fail(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    fail('BOOTSTRAP_ADMIN_PASSWORD must contain both letters and numbers.');
  }
  if (WEAK_PASSWORDS.has(value.toLowerCase())) {
    fail('BOOTSTRAP_ADMIN_PASSWORD is too common; choose a stronger one.');
  }
  return value;
}

async function main() {
  if (!EMAIL || !EMAIL_PATTERN.test(EMAIL)) {
    fail('BOOTSTRAP_ADMIN_EMAIL is required and must be a valid email.');
  }
  const password = requireStrongPassword(PASSWORD);

  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, role: true, displayName: true },
  });

  if (existing) {
    // Never silently overwrite a (possibly rotated) password — just make sure the admin
    // still owns an organization so the `/admin` routes resolve org context.
    await ensureOwnOrganization(prisma, { id: existing.id, displayName: existing.displayName });
    console.log(
      `Platform admin ${EMAIL} already exists — password left unchanged, membership ensured.`,
    );
    if (existing.role !== UserRole.ADMIN) {
      console.warn(`WARNING: ${EMAIL} exists but is NOT a platform ADMIN (role=${existing.role}).`);
    }
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: await hashPassword(password),
      displayName: 'Platform Admin',
      role: UserRole.ADMIN,
    },
  });
  await ensureOwnOrganization(prisma, admin);

  console.log(`Platform admin created: ${admin.email}`);
  console.log('Next: sign in at https://<DOMAIN>/admin and provision the first shop org + owner.');
}

main()
  .catch((error) => {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
