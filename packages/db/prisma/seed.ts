import {
  MarketplaceProvider,
  OrgRole,
  PrismaClient,
  RecordingStatus,
  UserRole,
} from '@prisma/client';

import { DEMO_SHOP_ID, DEMO_STAFF_EMAIL, DEMO_USER_EMAIL, DEMO_VARIANTS } from './demo-data';
import { ensureOwnOrganization, hashPassword } from './account-helpers';

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@falka.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const SEED_DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo123!';
const SEED_STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? 'Staff123!';

/**
 * Idempotently seed a small mapped catalog (product → variant → stocked inventory →
 * listing → sync-ready mapping) so a freshly seeded DB can demonstrate the
 * reserve → ship → release order lifecycle out of the box. Skips any variant whose
 * SKU already exists, so re-running the seed is safe.
 */
async function seedInventoryDemo(
  scope: { userId: string; organizationId: string },
  connection: { id: string; shopId: string; provider: MarketplaceProvider },
) {
  const { userId, organizationId } = scope;
  let created = 0;

  for (const demo of DEMO_VARIANTS) {
    const existingVariant = await prisma.productVariant.findFirst({
      where: { organizationId, sku: demo.sku },
    });
    if (existingVariant) continue;

    const product =
      (await prisma.product.findFirst({ where: { organizationId, name: demo.productName } })) ??
      (await prisma.product.create({
        data: { userId, organizationId, name: demo.productName },
      }));

    const variant = await prisma.productVariant.create({
      data: {
        userId,
        organizationId,
        productId: product.id,
        sku: demo.sku,
        name: demo.variantName,
        price: '100000',
      },
    });

    await prisma.inventory.create({
      data: { variantId: variant.id, availableStock: demo.stock, lastAdjustedAt: new Date() },
    });
    await prisma.stockLedger.create({
      data: {
        userId,
        organizationId,
        variantId: variant.id,
        delta: demo.stock,
        balanceAfter: demo.stock,
        reason: 'RESTOCK',
        source: 'MANUAL',
        note: 'Seed initial stock',
      },
    });

    const listing = await prisma.marketplaceProduct.create({
      data: {
        userId,
        organizationId,
        marketplaceConnectionId: connection.id,
        provider: connection.provider,
        externalProductId: `${connection.shopId}-P${demo.index}`,
        externalVariantId: `${connection.shopId}-V${demo.index}`,
        externalSku: demo.sku,
        externalProductName: demo.productName,
        externalVariantName: demo.variantName,
        stock: demo.stock,
        status: 'ACTIVE',
        lastImportedAt: new Date(),
      },
    });
    await prisma.marketplaceProductMapping.create({
      data: {
        userId,
        organizationId,
        marketplaceConnectionId: connection.id,
        marketplaceProductId: listing.id,
        productVariantId: variant.id,
        provider: connection.provider,
        mappingStatus: 'MAPPED',
        syncEnabled: true,
        autoMapped: true,
      },
    });
    created += 1;
  }

  console.log(
    created > 0
      ? `Inventory demo: ${created} mapped variant(s) seeded for the order-pull lifecycle.`
      : 'Inventory demo: mapped variants already present.',
  );
}

async function main() {
  console.log('Seeding database...');

  const adminPasswordHash = await hashPassword(SEED_ADMIN_PASSWORD);
  const demoPasswordHash = await hashPassword(SEED_DEMO_PASSWORD);
  const staffPasswordHash = await hashPassword(SEED_STAFF_PASSWORD);

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
    },
  });
  await ensureOwnOrganization(prisma, admin);

  console.log(`Admin user: ${admin.email} (${admin.role})`);

  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {
      displayName: 'Demo User',
      role: UserRole.USER,
      passwordHash: demoPasswordHash,
    },
    create: {
      email: DEMO_USER_EMAIL,
      passwordHash: demoPasswordHash,
      displayName: 'Demo User',
      role: UserRole.USER,
    },
  });
  const demoOrg = await ensureOwnOrganization(prisma, demoUser);

  console.log(`Demo user: ${demoUser.email} (${demoUser.role})`);

  // A STAFF member inside the demo org — RBAC is testable straight after seed.
  const staffUser = await prisma.user.upsert({
    where: { email: DEMO_STAFF_EMAIL },
    update: {
      displayName: 'Demo Staf',
      role: UserRole.USER,
      passwordHash: staffPasswordHash,
    },
    create: {
      email: DEMO_STAFF_EMAIL,
      passwordHash: staffPasswordHash,
      displayName: 'Demo Staf',
      role: UserRole.USER,
    },
  });
  await prisma.organizationMember.upsert({
    where: { userId: staffUser.id },
    update: { organizationId: demoOrg.id, role: OrgRole.STAFF },
    create: { organizationId: demoOrg.id, userId: staffUser.id, role: OrgRole.STAFF },
  });

  console.log(`Staff user: ${staffUser.email} (STAFF of ${demoOrg.name})`);

  const existingRecording = await prisma.recording.findFirst({
    where: { organizationId: demoOrg.id, noResi: 'SEED-RESI-001' },
  });

  if (!existingRecording) {
    const recording = await prisma.recording.create({
      data: {
        userId: demoUser.id,
        organizationId: demoOrg.id,
        noResi: 'SEED-RESI-001',
        generatedFilename: 'seed-recording-001.webm',
        storageProvider: 'cloudflare-r2',
        storageBucket: 'falka-recordings',
        // Org-prefixed key — matches the production format `${orgId}/...`.
        storageKey: `${demoOrg.id}/seed-recording-001.webm`,
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

  const connection =
    (await prisma.marketplaceConnection.findFirst({
      where: {
        organizationId: demoOrg.id,
        provider: MarketplaceProvider.SHOPEE,
        shopId: DEMO_SHOP_ID,
      },
    })) ??
    (await prisma.marketplaceConnection.create({
      data: {
        userId: demoUser.id,
        organizationId: demoOrg.id,
        provider: MarketplaceProvider.SHOPEE,
        shopId: DEMO_SHOP_ID,
        shopName: 'Seed Shopee Store',
        encryptedAccessToken: 'encrypted-token-placeholder',
        encryptedRefreshToken: 'encrypted-refresh-placeholder',
        isActive: true,
      },
    }));

  console.log(`Sample marketplace connection: ${connection.provider} / ${connection.shopName}`);

  await seedInventoryDemo({ userId: demoUser.id, organizationId: demoOrg.id }, connection);

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      organizationId: admin.id,
      action: 'seed.completed',
      resource: 'database',
      metadata: {
        seededAt: new Date().toISOString(),
        enums: {
          userRoles: Object.values(UserRole),
          orgRoles: Object.values(OrgRole),
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
