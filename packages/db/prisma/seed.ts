import { MarketplaceProvider, PrismaClient, RecordingStatus, UserRole } from '@prisma/client';
import { DEFAULT_STORAGE_QUOTA_BYTES } from '@olshop/config/limits';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@olshop.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const SEED_DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo123!';

async function hashSeedPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function main() {
  console.log('Seeding database...');

  const adminPasswordHash = await hashSeedPassword(SEED_ADMIN_PASSWORD);
  const demoPasswordHash = await hashSeedPassword(SEED_DEMO_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {
      displayName: 'System Admin',
      role: UserRole.ADMIN,
      passwordHash: adminPasswordHash,
    },
    create: {
      email: SEED_ADMIN_EMAIL,
      passwordHash: adminPasswordHash,
      displayName: 'System Admin',
      role: UserRole.ADMIN,
      storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
      storageUsedBytes: BigInt(0),
    },
  });

  console.log(`Admin user: ${admin.email} (${admin.role})`);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@olshop.local' },
    update: {
      displayName: 'Demo User',
      role: UserRole.USER,
      passwordHash: demoPasswordHash,
    },
    create: {
      email: 'demo@olshop.local',
      passwordHash: demoPasswordHash,
      displayName: 'Demo User',
      role: UserRole.USER,
      storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
    },
  });

  console.log(`Demo user: ${demoUser.email} (${demoUser.role})`);

  const existingRecording = await prisma.recording.findFirst({
    where: { userId: demoUser.id, noResi: 'SEED-RESI-001' },
  });

  if (!existingRecording) {
    const recording = await prisma.recording.create({
      data: {
        userId: demoUser.id,
        noResi: 'SEED-RESI-001',
        generatedFilename: 'seed-recording-001.webm',
        storageProvider: 'cloudflare-r2',
        storageBucket: 'olshop-recordings',
        storageKey: `users/${demoUser.id}/seed-recording-001.webm`,
        publicUrl: 'https://example.r2.dev/users/seed-recording-001.webm',
        mimeType: 'video/webm',
        fileSizeBytes: BigInt(1_048_576),
        durationSeconds: 120,
        status: RecordingStatus.COMPLETED,
        startedAt: new Date(Date.now() - 120_000),
        stoppedAt: new Date(Date.now() - 60_000),
        uploadedAt: new Date(),
      },
    });

    console.log(`Sample recording: ${recording.noResi} (${recording.status})`);
  }

  const existingConnection = await prisma.marketplaceConnection.findFirst({
    where: {
      userId: demoUser.id,
      provider: MarketplaceProvider.SHOPEE,
      shopId: 'seed-shop-001',
    },
  });

  if (!existingConnection) {
    const connection = await prisma.marketplaceConnection.create({
      data: {
        userId: demoUser.id,
        provider: MarketplaceProvider.SHOPEE,
        shopId: 'seed-shop-001',
        shopName: 'Seed Shopee Store',
        encryptedAccessToken: 'encrypted-token-placeholder',
        encryptedRefreshToken: 'encrypted-refresh-placeholder',
        isActive: true,
      },
    });

    console.log(`Sample marketplace connection: ${connection.provider} / ${connection.shopName}`);
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'seed.completed',
      resource: 'database',
      metadata: {
        seededAt: new Date().toISOString(),
        enums: {
          userRoles: Object.values(UserRole),
          recordingStatuses: Object.values(RecordingStatus),
          marketplaceProviders: Object.values(MarketplaceProvider),
        },
      },
    },
  });

  console.log('Seed completed.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
