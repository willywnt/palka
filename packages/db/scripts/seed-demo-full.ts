/**
 * Comprehensive demo seed: ONE organization ("Toko Palka Demo") with three sign-ins
 * (OWNER / ADMIN / STAFF) and rich, internally-consistent data across EVERY feature and every
 * meaningful STATE, so a fresh login looks complete and "alive":
 *   suppliers · catalog (products + grouped variants + a zero-variant product + an archived
 *   variant + a backdated dead-stock variant + bundles: live / inactive / archived) · inventory
 *   with a real ledger history (available/reserved/damaged/incoming all exercised) · POS sales
 *   (discount/PPN · partial + full refund · VOID · a bundle sold exploded · CARD/OTHER · below-cost)
 *   · marketplace connections (healthy / token-expiring / sync-failed tones) + mapped listings
 *   across all 3 channels + sync jobs · marketplace orders across ALL statuses incl. PENDING +
 *   an unmapped item · returns (received-restock + damaged + pending + rejected + auto-detected) ·
 *   purchase orders (draft / ordered / partial / received-with-HPP-blend / cancelled / bundle-PO) ·
 *   stock-opname (posted / draft / cancelled) · recordings (completed + failed) + share links ·
 *   team invites · a custom RBAC matrix · notifications (rich types, targeted + read state) +
 *   per-member preferences · audit log · finance (opex ledger · recurring templates · budgets · fees).
 *
 * NOT seedable (inherently runtime/storage-only, left for a live demo): oversold (the final
 * Inventory write clamps availableStock to >=0), scan-to-count + drift-check (need a live socket /
 * provider pull), and real recording/photo bytes (R2 objects a DB seed can't create — metadata is
 * seeded but playback/thumbnails 404). Per owner decision: product photos and a platform-admin
 * account are intentionally NOT seeded.
 *
 * Idempotent by existence: if the demo org already has products it only re-asserts the three
 * accounts and exits (re-run safely; to fully re-seed, use --fresh / SEED_FRESH=1).
 *
 * Run: pnpm --filter @palka/db db:seed-demo   (needs DATABASE_URL + DIRECT_URL in .env)
 */
import { createHash } from 'crypto';

import { DEFAULT_STORAGE_QUOTA_BYTES } from '@palka/config/limits';
import {
  ExpenseCategory,
  MarketplaceMappingStatus,
  MarketplaceProvider,
  MarketplaceSyncJobStatus,
  MarketplaceSyncStatus,
  NotificationCategory,
  NotificationSeverity,
  NotificationType,
  OrderStatus,
  OrgRole,
  PrismaClient,
  PurchaseOrderStatus,
  RecordingStatus,
  ReturnDisposition,
  ReturnStatus,
  SalePaymentMethod,
  SaleStatus,
  StockLedgerReason,
  StockLedgerSource,
  StockOpnameStatus,
  UserRole,
  type Prisma,
} from '@prisma/client';

import { hashPassword } from '../prisma/account-helpers';

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo123!';
const OWNER_EMAIL = 'owner@palka.demo';
const ADMIN_EMAIL = 'admin@palka.demo';
const STAFF_EMAIL = 'staff@palka.demo';
const ORG_NAME = 'Toko Palka Demo';

const DAY = 86_400_000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);
const rp = (n: number): string => String(Math.round(n));
const code = (prefix: string, n: number): string => `${prefix}${String(n).padStart(5, '0')}`;
/** Mangled SKU of a soft-deleted variant/bundle (mirrors catalog/utils/variants.archivedSku). */
const archivedSku = (sku: string, id: string): string => `${sku}::deleted::${id}`;
/** A throwaway share-token's stored hash (mirrors the sha256 the share service stores). */
const tokenHash = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/**
 * Split a bundle total (price/cost) into per-component UNIT amounts proportional to each
 * component's standard per-unit value — mirrors catalog/utils/bundle-allocation.allocateBundleUnitAmounts
 * (round-half-up integer division). Callers derive the document total from Σ(unit×qty).
 */
function allocateBundleUnitAmounts(
  totalMinor: number,
  components: { weightMinor: number; quantity: number }[],
): number[] {
  if (components.length === 0) return [];
  const total = BigInt(Math.max(0, Math.round(totalMinor)));
  const weights = components.map((c) => BigInt(Math.max(0, Math.round(c.weightMinor))));
  const quantities = components.map((c) => BigInt(Math.max(0, Math.trunc(c.quantity))));
  const totalWeight = components.reduce((sum, _c, i) => sum + weights[i]! * quantities[i]!, 0n);
  const roundDiv = (n: bigint, d: bigint): number =>
    d <= 0n ? 0 : Number((n * 2n + d) / (d * 2n));
  if (totalWeight <= 0n) {
    const totalUnits = quantities.reduce((sum, q) => sum + q, 0n);
    const perUnit = roundDiv(total, totalUnits);
    return components.map(() => perUnit);
  }
  return components.map((_c, i) => roundDiv(total * weights[i]!, totalWeight));
}

/**
 * `--fresh` (or SEED_FRESH=1) wipes the demo org's existing data before reseeding, so a re-run
 * gives a clean, fully-refreshed demo. Without it the seed is idempotent (skips if data exists).
 */
const FRESH = process.argv.includes('--fresh') || process.env.SEED_FRESH === '1';

/**
 * Delete ALL of the demo org's feature data, scoped to `organizationId` only (never touches
 * another org). FK-safe order: rows a parent cascades (order→items/returns, sale→items/refunds,
 * connection-owned products/mappings/jobs, PO/opname/bundle items, recording→share-links,
 * notification reads) go via their parent; the StockLedger is cleared before variants (its
 * variant FK is Restrict).
 */
async function wipeOrgData(organizationId: string): Promise<void> {
  await prisma.marketplaceSyncJob.deleteMany({ where: { organizationId } });
  await prisma.order.deleteMany({ where: { organizationId } }); // cascades orderItems + returns(+items)
  await prisma.marketplaceProductMapping.deleteMany({ where: { organizationId } });
  await prisma.marketplaceProduct.deleteMany({ where: { organizationId } });
  await prisma.marketplaceConnection.deleteMany({ where: { organizationId } });
  await prisma.sale.deleteMany({ where: { organizationId } }); // cascades saleItems + refunds(+items)
  await prisma.purchaseOrder.deleteMany({ where: { organizationId } }); // cascades poItems
  await prisma.stockOpname.deleteMany({ where: { organizationId } }); // cascades opnameItems
  await prisma.bundle.deleteMany({ where: { organizationId } }); // cascades bundleItems
  await prisma.recording.deleteMany({ where: { organizationId } }); // cascades recordingShareLinks
  await prisma.notification.deleteMany({ where: { organizationId } }); // cascades notificationReads
  await prisma.notificationPreference.deleteMany({ where: { organizationId } });
  await prisma.organizationInvite.deleteMany({ where: { organizationId } });
  await prisma.stockLedger.deleteMany({ where: { organizationId } }); // before variants (FK Restrict)
  await prisma.productVariant.deleteMany({ where: { organizationId } }); // cascades inventory
  await prisma.product.deleteMany({ where: { organizationId } });
  await prisma.supplier.deleteMany({ where: { organizationId } });
  await prisma.expense.deleteMany({ where: { organizationId } }); // before templates (FK SetNull)
  await prisma.expenseTemplate.deleteMany({ where: { organizationId } });
  await prisma.budget.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
}

// ── Catalog fixtures ────────────────────────────────────────────────────────────────────────
type VariantSeed = {
  sku: string;
  product: string;
  group?: string;
  name: string;
  price: number;
  cost: number;
  initial: number;
  lowStock: number;
  leadTimeDays?: number;
  minOrderQty?: number;
  supplier?: 'tekstil' | 'aksesoris' | 'grosir';
  barcode?: string;
  /** Backdate the variant's createdAt (for the dead-stock report's age math). */
  createdDaysAgo?: number;
  /** When a QR label was last printed (null = never). */
  labelPrintedDaysAgo?: number;
  /** Low-stock alert toggle (default true). */
  alertEnabled?: boolean;
  /** Shipping weight in kg. */
  weight?: number;
};

const VARIANTS: VariantSeed[] = [
  // Grouped product (subvariants share the variantGroup label).
  {
    sku: 'KAOS-HTM-M',
    product: 'Kaos Polos Premium',
    group: 'Kaos Polos Premium',
    name: 'Hitam / M',
    price: 95000,
    cost: 48000,
    initial: 60,
    lowStock: 12,
    leadTimeDays: 7,
    minOrderQty: 12,
    supplier: 'tekstil',
    barcode: '8991234500017',
    weight: 0.22,
  },
  {
    // Initial bumped (was 8) so recent demand sales leave it at ~8 (low) WITH velocity → reorder
    // classifies it instead of NO_DATA.
    sku: 'KAOS-HTM-L',
    product: 'Kaos Polos Premium',
    group: 'Kaos Polos Premium',
    name: 'Hitam / L',
    price: 95000,
    cost: 48000,
    initial: 11,
    lowStock: 12,
    minOrderQty: 12,
    supplier: 'tekstil',
  },
  {
    sku: 'KAOS-PTH-M',
    product: 'Kaos Polos Premium',
    group: 'Kaos Polos Premium',
    name: 'Putih / M',
    price: 95000,
    cost: 48000,
    initial: 55,
    lowStock: 12,
    supplier: 'tekstil',
    labelPrintedDaysAgo: 5,
  },
  {
    sku: 'KAOS-PTH-L',
    product: 'Kaos Polos Premium',
    group: 'Kaos Polos Premium',
    name: 'Putih / L',
    price: 95000,
    cost: 48000,
    initial: 40,
    lowStock: 12,
    supplier: 'tekstil',
  },
  {
    // Initial bumped (was 6) so a demand sale leaves it at 6 (low) WITH velocity.
    sku: 'KAOS-NVY-M',
    product: 'Kaos Polos Premium',
    group: 'Kaos Polos Premium',
    name: 'Navy / M',
    price: 95000,
    cost: 48000,
    initial: 9,
    lowStock: 12,
    leadTimeDays: 5,
    supplier: 'tekstil',
  },
  {
    sku: 'HOODIE-ABU-M',
    product: 'Hoodie Fleece',
    name: 'Abu / M',
    price: 245000,
    cost: 130000,
    initial: 30,
    lowStock: 8,
    leadTimeDays: 14,
    minOrderQty: 6,
    supplier: 'tekstil',
    barcode: '8991234500024',
    weight: 0.6,
  },
  {
    sku: 'HOODIE-ABU-L',
    product: 'Hoodie Fleece',
    name: 'Abu / L',
    price: 245000,
    cost: 130000,
    initial: 22,
    lowStock: 8,
    supplier: 'tekstil',
  },
  {
    sku: 'HOODIE-HTM-L',
    product: 'Hoodie Fleece',
    name: 'Hitam / L',
    price: 245000,
    cost: 130000,
    initial: 5,
    lowStock: 8,
    supplier: 'tekstil',
    // Low-stock alert intentionally OFF (demo: a variant in-threshold but not alerting).
    alertEnabled: false,
  },
  {
    sku: 'TOPI-HTM',
    product: 'Topi Baseball',
    name: 'Hitam',
    price: 75000,
    cost: 32000,
    initial: 70,
    lowStock: 15,
    leadTimeDays: 3,
    minOrderQty: 24,
    supplier: 'aksesoris',
    barcode: '8991234500031',
    labelPrintedDaysAgo: 5,
  },
  {
    sku: 'TOPI-KRM',
    product: 'Topi Baseball',
    name: 'Krem',
    price: 75000,
    cost: 32000,
    initial: 45,
    lowStock: 15,
    supplier: 'aksesoris',
    labelPrintedDaysAgo: 5,
  },
  {
    sku: 'TOTE-NAT',
    product: 'Tote Bag Kanvas',
    name: 'Natural',
    price: 60000,
    cost: 24000,
    initial: 90,
    lowStock: 20,
    supplier: 'aksesoris',
    barcode: '8991234500048',
    labelPrintedDaysAgo: 6,
  },
  {
    sku: 'BOTOL-BIRU',
    product: 'Botol Minum 600ml',
    name: 'Biru',
    price: 55000,
    cost: 23000,
    initial: 50,
    lowStock: 10,
    leadTimeDays: 3,
    supplier: 'grosir',
    labelPrintedDaysAgo: 6,
  },
  {
    sku: 'BOTOL-PINK',
    product: 'Botol Minum 600ml',
    name: 'Pink',
    price: 55000,
    cost: 23000,
    initial: 38,
    lowStock: 10,
    supplier: 'grosir',
  },
  {
    sku: 'KAOSKAKI-SPT',
    product: 'Kaos Kaki Sport (3 pasang)',
    name: 'Standar',
    price: 45000,
    cost: 18000,
    initial: 120,
    lowStock: 24,
  },
  {
    // In-stock but NEVER sold and backdated → lands in the dead-stock report (age >= staleDays).
    sku: 'PIN-ENAMEL-X',
    product: 'Pin Enamel Koleksi',
    name: 'Edisi Pelaut',
    price: 35000,
    cost: 12000,
    initial: 40,
    lowStock: 8,
    createdDaysAgo: 120,
  },
];

type VariantState = {
  id: string;
  available: number;
  reserved: number;
  damaged: number;
  incoming: number;
};

async function main() {
  console.log('Seeding comprehensive demo org…');
  const passwordHash = await hashPassword(PASSWORD);
  const loginIp = '103.10.66.12';

  // ── Accounts + org (OWNER's id == org id, matching the storage-key convention) ───────────
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {
      displayName: 'Pemilik Toko',
      passwordHash,
      role: UserRole.USER,
      lastLoginAt: daysAgo(1),
      lastLoginIp: loginIp,
    },
    create: {
      email: OWNER_EMAIL,
      displayName: 'Pemilik Toko',
      passwordHash,
      role: UserRole.USER,
      lastLoginAt: daysAgo(1),
      lastLoginIp: loginIp,
    },
  });
  const organizationId = owner.id;
  // A non-default RBAC matrix so "Peran & akses" shows a customized allow-map (not the defaults:
  // ADMIN all-on / STAFF all-off). Full matrix per role so resolveOrgContext reads it unambiguously.
  const permissionKeys = [
    'reports.view',
    'purchasing.view',
    'marketplace.view',
    'finance.view',
    'sales.refund',
    'purchasing.cancel',
    'catalog.delete',
    'catalog.import',
    'inventory.adjust',
    'opname.post',
    'marketplace.manage',
    'team.manage',
    'finance.manage',
  ] as const;
  const adminOff = new Set(['finance.manage', 'marketplace.manage']);
  const staffOn = new Set(['reports.view', 'purchasing.view']);
  const permissions = {
    ADMIN: Object.fromEntries(permissionKeys.map((k) => [k, !adminOff.has(k)])),
    STAFF: Object.fromEntries(permissionKeys.map((k) => [k, staffOn.has(k)])),
  } as Prisma.InputJsonValue;
  const org = await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: ORG_NAME, qrisFeeRate: 0.7, permissions },
    create: {
      id: organizationId,
      name: ORG_NAME,
      storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
      plan: 'Demo',
      memberLimit: 10,
      qrisFeeRate: 0.7, // QRIS payment-fee rate (%) for the auto-derived fee estimate
      permissions,
    },
  });
  await prisma.organizationMember.upsert({
    where: { userId: owner.id },
    update: { organizationId, role: OrgRole.OWNER },
    create: { organizationId, userId: owner.id, role: OrgRole.OWNER },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      displayName: 'Admin Gudang',
      passwordHash,
      role: UserRole.USER,
      lastLoginAt: daysAgo(1),
      lastLoginIp: loginIp,
    },
    create: {
      email: ADMIN_EMAIL,
      displayName: 'Admin Gudang',
      passwordHash,
      role: UserRole.USER,
      lastLoginAt: daysAgo(1),
      lastLoginIp: loginIp,
    },
  });
  await prisma.organizationMember.upsert({
    where: { userId: adminUser.id },
    update: { organizationId, role: OrgRole.ADMIN },
    create: { organizationId, userId: adminUser.id, role: OrgRole.ADMIN },
  });

  const staffUser = await prisma.user.upsert({
    where: { email: STAFF_EMAIL },
    update: {
      displayName: 'Staf Kasir',
      passwordHash,
      role: UserRole.USER,
      lastLoginAt: daysAgo(2),
      lastLoginIp: loginIp,
    },
    create: {
      email: STAFF_EMAIL,
      displayName: 'Staf Kasir',
      passwordHash,
      role: UserRole.USER,
      lastLoginAt: daysAgo(2),
      lastLoginIp: loginIp,
    },
  });
  await prisma.organizationMember.upsert({
    where: { userId: staffUser.id },
    update: { organizationId, role: OrgRole.STAFF },
    create: { organizationId, userId: staffUser.id, role: OrgRole.STAFF },
  });

  console.log(
    `Org "${org.name}" — OWNER ${OWNER_EMAIL} · ADMIN ${ADMIN_EMAIL} · STAFF ${STAFF_EMAIL}`,
  );

  if (FRESH) {
    await wipeOrgData(organizationId);
    console.log('--fresh: cleared existing demo-org data before reseeding.');
  }

  const alreadySeeded = await prisma.product.count({ where: { organizationId } });
  if (alreadySeeded > 0) {
    console.log('Demo data already present — accounts re-asserted, skipping data creation.');
    return;
  }

  // ── Suppliers ────────────────────────────────────────────────────────────────────────────
  const supplierByKey: Record<string, string> = {};
  const supplierSeeds = [
    { key: 'tekstil', name: 'PT Tekstil Jaya', phone: '081200000001', lead: 7, moq: 12 },
    { key: 'aksesoris', name: 'CV Aksesoris Nusantara', phone: '081200000002', lead: 14, moq: 24 },
    { key: 'grosir', name: 'Gudang Grosir Online', phone: '081200000003', lead: 3, moq: 6 },
  ];
  for (const s of supplierSeeds) {
    const supplier = await prisma.supplier.create({
      data: {
        userId: owner.id,
        organizationId,
        name: s.name,
        phone: s.phone,
        defaultLeadTimeDays: s.lead,
        defaultMinOrderQty: s.moq,
      },
    });
    supplierByKey[s.key] = supplier.id;
  }

  // ── Catalog: products + variants ───────────────────────────────────────────────────────────
  const productByName: Record<string, string> = {};
  const state: Record<string, VariantState> = {};
  const ledger: Prisma.StockLedgerCreateManyInput[] = [];

  /** Apply an available-stock movement: tracks the running balance + queues a ledger row. */
  function move(
    sku: string,
    delta: number,
    reason: StockLedgerReason,
    source: StockLedgerSource,
    opts: { at: Date; referenceId?: string; note?: string },
  ) {
    const s = state[sku];
    if (!s) throw new Error(`Unknown SKU in move(): ${sku}`);
    s.available += delta;
    ledger.push({
      userId: owner.id,
      organizationId,
      variantId: s.id,
      delta,
      balanceAfter: s.available,
      reason,
      source,
      referenceId: opts.referenceId ?? null,
      note: opts.note ?? null,
      createdAt: opts.at,
    });
  }

  for (const v of VARIANTS) {
    const productId =
      productByName[v.product] ??
      (
        await prisma.product.create({
          data: {
            userId: owner.id,
            organizationId,
            name: v.product,
            category: 'Pakaian & aksesoris',
            ...(v.product === 'Hoodie Fleece'
              ? { description: 'Fleece tebal 320gsm, cocok untuk musim hujan.' }
              : {}),
          },
        })
      ).id;
    productByName[v.product] = productId;

    const variant = await prisma.productVariant.create({
      data: {
        userId: owner.id,
        organizationId,
        productId,
        sku: v.sku,
        name: v.name,
        barcode: v.barcode ?? null,
        variantGroup: v.group ?? null,
        price: rp(v.price),
        cost: rp(v.cost),
        lowStockThreshold: v.lowStock,
        alertEnabled: v.alertEnabled ?? true,
        weight: v.weight !== undefined ? String(v.weight) : null,
        leadTimeDays: v.leadTimeDays ?? null,
        minOrderQty: v.minOrderQty ?? null,
        supplierId: v.supplier ? supplierByKey[v.supplier] : null,
        labelPrintedAt: v.labelPrintedDaysAgo !== undefined ? daysAgo(v.labelPrintedDaysAgo) : null,
        ...(v.createdDaysAgo !== undefined ? { createdAt: daysAgo(v.createdDaysAgo) } : {}),
      },
    });
    state[v.sku] = { id: variant.id, available: 0, reserved: 0, damaged: 0, incoming: 0 };
    move(v.sku, v.initial, StockLedgerReason.RESTOCK, StockLedgerSource.MANUAL, {
      at: daysAgo(v.createdDaysAgo ?? 40),
      note: 'Stok awal',
    });
  }
  console.log(
    `Catalog: ${Object.keys(productByName).length} products · ${VARIANTS.length} variants.`,
  );

  // A product with ZERO variants (create-without-variant; add variants later from detail).
  await prisma.product.create({
    data: {
      userId: owner.id,
      organizationId,
      name: 'Jaket Bomber (baru)',
      category: 'Pakaian & aksesoris',
      description: 'Produk baru — varian menyusul.',
    },
  });

  // An ARCHIVED (soft-deleted) variant under "Kaos Polos Premium": its SKU is mangled to free the
  // original ('KAOS-MRH-M') for reuse, and it keeps an Inventory row (restoreVariant reads it).
  // Restorable (no live variant/bundle owns 'KAOS-MRH-M').
  const archivedVariant = await prisma.productVariant.create({
    data: {
      userId: owner.id,
      organizationId,
      productId: productByName['Kaos Polos Premium']!,
      sku: 'KAOS-MRH-M',
      name: 'Merah / M',
      variantGroup: 'Kaos Polos Premium',
      price: rp(95000),
      cost: rp(48000),
      lowStockThreshold: 12,
      supplierId: supplierByKey['tekstil'],
      deletedAt: daysAgo(20),
    },
  });
  await prisma.productVariant.update({
    where: { id: archivedVariant.id },
    data: { sku: archivedSku('KAOS-MRH-M', archivedVariant.id) },
  });
  await prisma.inventory.create({
    data: { variantId: archivedVariant.id, availableStock: 0, lastAdjustedAt: daysAgo(20) },
  });
  console.log('Catalog: + zero-variant product + 1 archived variant.');

  // ── Bundles: live + inactive + archived ─────────────────────────────────────────────────────
  const bundle = await prisma.bundle.create({
    data: {
      userId: owner.id,
      organizationId,
      sku: 'PAKET-OOTD',
      barcode: '8991234509990',
      name: 'Paket OOTD Hemat',
      price: rp(210000),
      labelPrintedAt: daysAgo(6),
      items: {
        create: [
          { productVariantId: state['KAOS-HTM-M']!.id, quantity: 1 },
          { productVariantId: state['TOPI-HTM']!.id, quantity: 1 },
          { productVariantId: state['TOTE-NAT']!.id, quantity: 1 },
        ],
      },
    },
  });
  // An INACTIVE bundle (hidden from POS/PO/scan, shown only on the bundles dashboard).
  await prisma.bundle.create({
    data: {
      userId: owner.id,
      organizationId,
      sku: 'PAKET-WINTER',
      name: 'Paket Winter Cozy',
      price: rp(295000),
      isActive: false,
      items: {
        create: [
          { productVariantId: state['HOODIE-ABU-M']!.id, quantity: 1 },
          { productVariantId: state['TOPI-KRM']!.id, quantity: 1 },
        ],
      },
    },
  });
  // An ARCHIVED bundle (soft-deleted; SKU mangled, composition kept → restorable from "Bundel terarsip").
  const archivedBundle = await prisma.bundle.create({
    data: {
      userId: owner.id,
      organizationId,
      sku: 'PAKET-LAMA',
      name: 'Paket Lebaran (lama)',
      price: rp(180000),
      deletedAt: daysAgo(15),
      items: {
        create: [
          { productVariantId: state['KAOS-PTH-M']!.id, quantity: 1 },
          { productVariantId: state['BOTOL-BIRU']!.id, quantity: 1 },
        ],
      },
    },
  });
  await prisma.bundle.update({
    where: { id: archivedBundle.id },
    data: { sku: archivedSku('PAKET-LAMA', archivedBundle.id) },
  });
  console.log(`Bundles: ${bundle.name} (live) + 1 inactive + 1 archived.`);

  // ── POS sales (discount/PPN · CARD/OTHER · customer · velocity) ─────────────────────────────
  let saleSeq = 0;
  let refundSeq = 0;
  type SaleLine = { sku: string; qty: number };
  type SaleSeed = {
    lines: SaleLine[];
    payment: SalePaymentMethod;
    discount: number;
    taxRate: number;
    taxInclusive: boolean;
    daysBack: number;
    actor: string;
    customerName?: string;
    note?: string;
    refundQtyFirstLine?: number;
    /** Full multi-line refund (every line, full qty) — values lines net incl. PPN share. */
    fullRefund?: boolean;
  };
  const saleSeeds: SaleSeed[] = [
    {
      lines: [
        { sku: 'KAOS-HTM-M', qty: 2 },
        { sku: 'TOPI-HTM', qty: 1 },
      ],
      payment: SalePaymentMethod.CASH,
      discount: 0,
      taxRate: 0,
      taxInclusive: false,
      daysBack: 18,
      actor: staffUser.id,
      customerName: 'Pelanggan Walk-in',
    },
    {
      lines: [{ sku: 'HOODIE-ABU-M', qty: 1 }],
      payment: SalePaymentMethod.QRIS,
      discount: 20000,
      taxRate: 0,
      taxInclusive: false,
      daysBack: 15,
      actor: staffUser.id,
      customerName: 'Sinta',
    },
    {
      lines: [
        { sku: 'BOTOL-BIRU', qty: 3 },
        { sku: 'BOTOL-PINK', qty: 2 },
      ],
      payment: SalePaymentMethod.CASH,
      discount: 0,
      taxRate: 11,
      taxInclusive: true,
      daysBack: 12,
      actor: staffUser.id,
    },
    {
      lines: [{ sku: 'TOTE-NAT', qty: 4 }],
      payment: SalePaymentMethod.TRANSFER,
      discount: 0,
      taxRate: 0,
      taxInclusive: false,
      daysBack: 9,
      actor: owner.id,
      customerName: 'Reseller Andi',
      note: 'Langganan grosir',
    },
    {
      // PPN-exclusive multi-line sale → fully refunded (both lines) below.
      lines: [
        { sku: 'KAOS-PTH-M', qty: 1 },
        { sku: 'KAOS-PTH-L', qty: 1 },
      ],
      payment: SalePaymentMethod.QRIS,
      discount: 0,
      taxRate: 11,
      taxInclusive: false,
      daysBack: 6,
      actor: staffUser.id,
      fullRefund: true,
    },
    {
      lines: [{ sku: 'KAOSKAKI-SPT', qty: 5 }],
      payment: SalePaymentMethod.CASH,
      discount: 15000,
      taxRate: 0,
      taxInclusive: false,
      daysBack: 4,
      actor: staffUser.id,
      refundQtyFirstLine: 2,
    },
    {
      lines: [{ sku: 'TOPI-KRM', qty: 2 }],
      payment: SalePaymentMethod.CARD,
      discount: 0,
      taxRate: 0,
      taxInclusive: false,
      daysBack: 2,
      actor: staffUser.id,
    },
    {
      lines: [
        { sku: 'HOODIE-ABU-L', qty: 1 },
        { sku: 'BOTOL-PINK', qty: 1 },
      ],
      payment: SalePaymentMethod.QRIS,
      discount: 0,
      taxRate: 0,
      taxInclusive: false,
      daysBack: 1,
      actor: owner.id,
    },
    {
      // Recent demand on the two low-stock kaos so the reorder report classifies them (not NO_DATA).
      lines: [
        { sku: 'KAOS-HTM-L', qty: 3 },
        { sku: 'KAOS-NVY-M', qty: 3 },
      ],
      payment: SalePaymentMethod.OTHER,
      discount: 0,
      taxRate: 0,
      taxInclusive: false,
      daysBack: 8,
      actor: staffUser.id,
    },
  ];

  for (const seed of saleSeeds) {
    saleSeq += 1;
    const at = daysAgo(seed.daysBack);
    const priced = seed.lines.map((line) => {
      const v = VARIANTS.find((x) => x.sku === line.sku)!;
      return { ...line, price: v.price, cost: v.cost, name: v.product, variantName: v.name };
    });
    const subtotal = priced.reduce((sum, l) => sum + l.price * l.qty, 0);
    const base = subtotal - seed.discount;
    const tax = seed.taxRate
      ? seed.taxInclusive
        ? Math.round(base - base / (1 + seed.taxRate / 100))
        : Math.round(base * (seed.taxRate / 100))
      : 0;
    const total = seed.taxInclusive ? base : base + tax;
    const status =
      seed.refundQtyFirstLine || seed.fullRefund
        ? SaleStatus.PARTIALLY_REFUNDED
        : SaleStatus.COMPLETED;

    const sale = await prisma.sale.create({
      data: {
        userId: seed.actor,
        organizationId,
        code: code('S', saleSeq),
        customerName: seed.customerName ?? null,
        note: seed.note ?? null,
        paymentMethod: seed.payment,
        status,
        subtotalAmount: rp(subtotal),
        discountAmount: rp(seed.discount),
        taxRate: String(seed.taxRate),
        taxAmount: rp(tax),
        taxInclusive: seed.taxInclusive,
        totalAmount: rp(total),
        createdAt: at,
        items: {
          create: priced.map((l, index) => ({
            productVariantId: state[l.sku]!.id,
            sku: l.sku,
            name: `${l.name} ${l.variantName}`,
            quantity: l.qty,
            unitPrice: rp(l.price),
            unitCost: rp(l.cost),
            // Allocate the whole cart discount to the first line (these demo discounts are single-line).
            discountAmount: rp(index === 0 ? seed.discount : 0),
          })),
        },
      },
      include: { items: true },
    });

    for (const l of priced) {
      move(l.sku, -l.qty, StockLedgerReason.SALE, StockLedgerSource.POS, {
        at,
        referenceId: sale.id,
        note: `Penjualan ${sale.code}`,
      });
    }

    // Partial refund (one line, partial qty), valued at the bare net unit (no PPN on this sale).
    if (seed.refundQtyFirstLine) {
      refundSeq += 1;
      const refundedAt = daysAgo(seed.daysBack - 1);
      const firstLine = sale.items[0]!;
      const firstSeed = priced[0]!;
      const refundAmount = firstSeed.price * seed.refundQtyFirstLine;
      const refund = await prisma.saleRefund.create({
        data: {
          userId: seed.actor,
          organizationId,
          saleId: sale.id,
          code: code('RF', refundSeq),
          totalAmount: rp(refundAmount),
          note: 'Barang dikembalikan pelanggan',
          createdAt: refundedAt,
          items: {
            create: [
              {
                saleItemId: firstLine.id,
                productVariantId: state[firstSeed.sku]!.id,
                sku: firstSeed.sku,
                name: `${firstSeed.name} ${firstSeed.variantName}`,
                quantity: seed.refundQtyFirstLine,
                amount: rp(refundAmount),
              },
            ],
          },
        },
      });
      move(firstSeed.sku, seed.refundQtyFirstLine, StockLedgerReason.SALE, StockLedgerSource.POS, {
        at: refundedAt,
        referenceId: refund.id,
        note: `Refund ${refund.code}`,
      });
    }

    // Full multi-line refund (every line, full qty), valued net incl. each line's PPN share.
    if (seed.fullRefund) {
      refundSeq += 1;
      const refundedAt = daysAgo(seed.daysBack - 1);
      const ppnShare = (gross: number): number =>
        seed.taxRate
          ? seed.taxInclusive
            ? Math.round(gross - gross / (1 + seed.taxRate / 100))
            : Math.round(gross * (seed.taxRate / 100))
          : 0;
      const refundItems = sale.items.map((item, index) => {
        const ps = priced[index]!;
        const gross = ps.price * ps.qty;
        const amount = gross + ppnShare(gross); // exclusive PPN: buyer paid gross + its share
        return {
          saleItemId: item.id,
          productVariantId: state[ps.sku]!.id,
          sku: ps.sku,
          name: `${ps.name} ${ps.variantName}`,
          quantity: ps.qty,
          amount: rp(amount),
        };
      });
      const refundTotal = refundItems.reduce((sum, r) => sum + Number(r.amount), 0);
      const refund = await prisma.saleRefund.create({
        data: {
          userId: seed.actor,
          organizationId,
          saleId: sale.id,
          code: code('RF', refundSeq),
          totalAmount: rp(refundTotal),
          note: 'Refund penuh — pesanan dibatalkan',
          createdAt: refundedAt,
          items: { create: refundItems },
        },
      });
      for (const ps of priced) {
        move(ps.sku, ps.qty, StockLedgerReason.SALE, StockLedgerSource.POS, {
          at: refundedAt,
          referenceId: refund.id,
          note: `Refund ${refund.code}`,
        });
      }
    }
  }

  // A VOIDed sale: stock restocks fully (net-zero ledger), no refund row, drops out of profit.
  saleSeq += 1;
  {
    const at = daysAgo(7);
    const voidSale = await prisma.sale.create({
      data: {
        userId: staffUser.id,
        organizationId,
        code: code('S', saleSeq),
        paymentMethod: SalePaymentMethod.CASH,
        status: SaleStatus.VOID,
        subtotalAmount: rp(75000),
        discountAmount: rp(0),
        taxRate: '0',
        taxAmount: rp(0),
        taxInclusive: false,
        totalAmount: rp(75000),
        note: 'Salah input — dibatalkan',
        createdAt: at,
        items: {
          create: [
            {
              productVariantId: state['TOPI-HTM']!.id,
              sku: 'TOPI-HTM',
              name: 'Topi Baseball Hitam',
              quantity: 1,
              unitPrice: rp(75000),
              unitCost: rp(32000),
            },
          ],
        },
      },
    });
    move('TOPI-HTM', -1, StockLedgerReason.SALE, StockLedgerSource.POS, {
      at,
      referenceId: voidSale.id,
      note: `Penjualan ${voidSale.code}`,
    });
    move('TOPI-HTM', 1, StockLedgerReason.SALE, StockLedgerSource.POS, {
      at,
      referenceId: voidSale.id,
      note: `Void ${voidSale.code}`,
    });
  }

  // A BUNDLE sold via POS: exploded into per-component lines tagged bundleName, price allocated.
  saleSeq += 1;
  {
    const at = daysAgo(5);
    const components = [
      {
        sku: 'KAOS-HTM-M',
        qty: 1,
        price: 95000,
        cost: 48000,
        name: 'Kaos Polos Premium Hitam / M',
      },
      { sku: 'TOPI-HTM', qty: 1, price: 75000, cost: 32000, name: 'Topi Baseball Hitam' },
      { sku: 'TOTE-NAT', qty: 1, price: 60000, cost: 24000, name: 'Tote Bag Kanvas Natural' },
    ];
    const allocated = allocateBundleUnitAmounts(
      210000,
      components.map((c) => ({ weightMinor: c.price, quantity: c.qty })),
    );
    const subtotal = components.reduce((sum, c, i) => sum + allocated[i]! * c.qty, 0);
    const bundleSale = await prisma.sale.create({
      data: {
        userId: owner.id,
        organizationId,
        code: code('S', saleSeq),
        customerName: 'Pembeli OOTD',
        paymentMethod: SalePaymentMethod.QRIS,
        status: SaleStatus.COMPLETED,
        subtotalAmount: rp(subtotal),
        discountAmount: rp(0),
        taxRate: '0',
        taxAmount: rp(0),
        taxInclusive: false,
        totalAmount: rp(subtotal),
        createdAt: at,
        items: {
          create: components.map((c, i) => ({
            productVariantId: state[c.sku]!.id,
            sku: c.sku,
            name: c.name,
            quantity: c.qty,
            unitPrice: rp(allocated[i]!),
            unitCost: rp(c.cost),
            bundleName: 'Paket OOTD Hemat',
          })),
        },
      },
    });
    for (const c of components) {
      move(c.sku, -c.qty, StockLedgerReason.SALE, StockLedgerSource.POS, {
        at,
        referenceId: bundleSale.id,
        note: `Penjualan ${bundleSale.code} (bundel)`,
      });
    }
  }

  // A below-cost sale (line unitPrice < unitCost) → trips the margin-leak surface + notification.
  saleSeq += 1;
  let belowCostSaleCode = '';
  {
    const at = daysAgo(3);
    belowCostSaleCode = code('S', saleSeq);
    const belowCostSale = await prisma.sale.create({
      data: {
        userId: staffUser.id,
        organizationId,
        code: belowCostSaleCode,
        paymentMethod: SalePaymentMethod.CASH,
        status: SaleStatus.COMPLETED,
        subtotalAmount: rp(40000),
        discountAmount: rp(0),
        taxRate: '0',
        taxAmount: rp(0),
        taxInclusive: false,
        totalAmount: rp(40000),
        note: 'Cuci gudang — di bawah modal',
        createdAt: at,
        items: {
          create: [
            {
              productVariantId: state['HOODIE-ABU-L']!.id,
              sku: 'HOODIE-ABU-L',
              name: 'Hoodie Fleece Abu / L',
              quantity: 1,
              unitPrice: rp(40000), // below the 130000 cost
              unitCost: rp(130000),
            },
          ],
        },
      },
    });
    move('HOODIE-ABU-L', -1, StockLedgerReason.SALE, StockLedgerSource.POS, {
      at,
      referenceId: belowCostSale.id,
      note: `Penjualan ${belowCostSale.code}`,
    });
  }
  console.log(`POS: ${saleSeq} sales (incl. void · bundle · below-cost · ${refundSeq} refunds).`);

  // A manual DAMAGE adjustment + a write-off (so the 'Rusak' bucket + dispose flow are non-empty).
  move('BOTOL-BIRU', -3, StockLedgerReason.DAMAGE, StockLedgerSource.MANUAL, {
    at: daysAgo(8),
    note: 'Rusak saat penyimpanan',
  });
  state['BOTOL-BIRU']!.damaged += 3;
  move('BOTOL-BIRU', 0, StockLedgerReason.DAMAGE_WRITE_OFF, StockLedgerSource.MANUAL, {
    at: daysAgo(7),
    note: 'Buang 1 unit rusak',
  });
  state['BOTOL-BIRU']!.damaged -= 1; // 3 damaged → 1 written off → 2 remain

  // ── Marketplace connections (healthy / token-expiring / sync-failed tones) ──────────────────
  const connections: Record<string, { id: string; shopId: string; provider: MarketplaceProvider }> =
    {};
  const connectionSeeds = [
    {
      key: 'lazada',
      provider: MarketplaceProvider.LAZADA,
      shopId: 'demo-lazada-01',
      shopName: 'Toko Palka (Lazada)',
      commission: 5,
      tokenExpiresDaysAgo: -20, // healthy token; tone driven 'danger' by a FAILED mapping below
      warehouses: ['WH-JKT', 'WH-SBY'],
      syncWarehouse: 'WH-JKT',
      cipher: null,
    },
    {
      key: 'shopee',
      provider: MarketplaceProvider.SHOPEE,
      shopId: 'demo-shopee-01',
      shopName: 'Toko Palka (Shopee)',
      commission: 4.5,
      tokenExpiresDaysAgo: -3, // expires in 3 days → "expiring soon" → health tone 'warn'
      warehouses: [],
      syncWarehouse: null,
      cipher: null,
    },
    {
      key: 'tokopedia',
      provider: MarketplaceProvider.TOKOPEDIA,
      shopId: 'demo-tokopedia-01',
      shopName: 'Toko Palka (Tokopedia)',
      commission: 3,
      tokenExpiresDaysAgo: -25,
      warehouses: [],
      syncWarehouse: null,
      cipher: 'demo-shop-cipher-tk01', // TikTok/Tokopedia shop_cipher
    },
  ];
  for (const c of connectionSeeds) {
    const conn = await prisma.marketplaceConnection.create({
      data: {
        userId: owner.id,
        organizationId,
        provider: c.provider,
        shopId: c.shopId,
        shopName: c.shopName,
        externalShopCipher: c.cipher,
        encryptedAccessToken: 'demo-encrypted-token',
        encryptedRefreshToken: 'demo-encrypted-refresh',
        tokenExpiresAt: daysAgo(c.tokenExpiresDaysAgo),
        isActive: true,
        lastImportedAt: daysAgo(3),
        knownWarehouseCodes: c.warehouses,
        syncWarehouseCode: c.syncWarehouse,
        commissionRate: c.commission, // % for the auto-derived MARKETPLACE_COMMISSION estimate
      },
    });
    connections[c.key] = { id: conn.id, shopId: c.shopId, provider: c.provider };
  }

  // Map a subset of variants on ALL three channels; leave a couple NEEDS_REVIEW on Shopee, and
  // mark one Lazada mapping FAILED so a connection actually shows failedSyncCount + 'danger' tone.
  const mappedSkus = VARIANTS.slice(0, 8);
  for (const channel of ['lazada', 'shopee', 'tokopedia'] as const) {
    const conn = connections[channel]!;
    const count = channel === 'tokopedia' ? 5 : 8;
    let idx = 0;
    for (const v of mappedSkus.slice(0, count)) {
      idx += 1;
      const needsReview = channel === 'shopee' && idx > 6;
      const failed = channel === 'lazada' && idx === 2;
      const handMapped = channel === 'lazada' && idx === 1;
      const listing = await prisma.marketplaceProduct.create({
        data: {
          userId: owner.id,
          organizationId,
          marketplaceConnectionId: conn.id,
          provider: conn.provider,
          externalProductId: `${conn.shopId}-P${idx}`,
          externalVariantId: `${conn.shopId}-V${idx}`,
          externalSku: v.sku,
          externalProductName: v.product,
          externalVariantName: v.name,
          stock: Math.max(0, state[v.sku]!.available),
          status: needsReview ? 'INACTIVE' : 'ACTIVE',
          lastImportedAt: daysAgo(3),
        },
      });
      const mapping = await prisma.marketplaceProductMapping.create({
        data: {
          userId: owner.id,
          organizationId,
          marketplaceConnectionId: conn.id,
          marketplaceProductId: listing.id,
          productVariantId: state[v.sku]!.id,
          provider: conn.provider,
          mappingStatus: needsReview
            ? MarketplaceMappingStatus.NEEDS_REVIEW
            : MarketplaceMappingStatus.MAPPED,
          syncEnabled: !needsReview,
          autoMapped: !handMapped,
          mappingConfidence: needsReview ? '0.90' : '1.00',
          lastSyncedAt: needsReview ? null : daysAgo(1),
          lastSyncStatus: needsReview
            ? null
            : failed
              ? MarketplaceSyncStatus.FAILED
              : MarketplaceSyncStatus.SYNCED,
          lastSyncError: failed ? 'Provider menolak: item terkunci (demo).' : null,
        },
      });
      // Sync-job history: one FAILED + one in-flight PROCESSING on Lazada, SUCCESS otherwise.
      const processing = channel === 'lazada' && idx === 3;
      await prisma.marketplaceSyncJob.create({
        data: {
          userId: owner.id,
          organizationId,
          marketplaceConnectionId: conn.id,
          marketplaceProductMappingId: mapping.id,
          provider: conn.provider,
          idempotencyKey: `demo-sync-${channel}-${idx}`,
          syncStatus: failed
            ? MarketplaceSyncJobStatus.FAILED
            : processing
              ? MarketplaceSyncJobStatus.PROCESSING
              : MarketplaceSyncJobStatus.SUCCESS,
          payload: {
            availableStock: Math.max(0, state[v.sku]!.available),
          } as Prisma.InputJsonValue,
          attempts: failed ? 3 : 1,
          errorMessage: failed ? 'Provider menolak: item terkunci (demo).' : null,
          completedAt: processing ? null : daysAgo(1),
        },
      });
    }
  }
  console.log('Marketplace: 3 connections (ok/warn/danger), listings on all channels + sync jobs.');

  // ── Marketplace orders across ALL statuses (+ a PENDING + an unmapped item) ──────────────────
  let orderSeq = 0;
  type OrderLine = { sku: string; qty: number; unmapped?: boolean; externalName?: string };
  type OrderSeed = {
    channel: 'lazada' | 'shopee';
    status: OrderStatus;
    lines: OrderLine[];
    daysBack: number;
    buyer: string;
    trackingNumber?: string;
    cancelReason?: string;
  };
  const orderSeeds: OrderSeed[] = [
    {
      channel: 'lazada',
      status: OrderStatus.PENDING,
      lines: [{ sku: 'BOTOL-BIRU', qty: 1 }],
      daysBack: 1,
      buyer: 'Tono',
    },
    {
      channel: 'lazada',
      status: OrderStatus.PAID,
      lines: [{ sku: 'KAOS-PTH-M', qty: 2 }],
      daysBack: 5,
      buyer: 'Rina',
    },
    {
      channel: 'shopee',
      status: OrderStatus.PAID,
      lines: [{ sku: 'TOTE-NAT', qty: 3 }],
      daysBack: 4,
      buyer: 'Budi',
    },
    {
      // PAID with an UNMAPPED line (productVariantId null) → unresolvedCount > 0; reserves nothing.
      channel: 'shopee',
      status: OrderStatus.PAID,
      lines: [
        { sku: 'UNKNOWN-SKU-X', qty: 1, unmapped: true, externalName: 'Sandal Selop Import' },
      ],
      daysBack: 2,
      buyer: 'Vina',
    },
    {
      channel: 'lazada',
      status: OrderStatus.SHIPPED,
      lines: [{ sku: 'HOODIE-ABU-M', qty: 1 }],
      daysBack: 7,
      buyer: 'Sari',
      trackingNumber: 'JNE-DEMO-1001',
    },
    {
      channel: 'shopee',
      status: OrderStatus.SHIPPED,
      lines: [{ sku: 'TOPI-HTM', qty: 2 }],
      daysBack: 6,
      buyer: 'Andi',
      trackingNumber: 'SICEPAT-DEMO-1002',
    },
    {
      channel: 'lazada',
      status: OrderStatus.COMPLETED,
      lines: [
        { sku: 'KAOS-PTH-L', qty: 1 },
        { sku: 'BOTOL-BIRU', qty: 1 },
      ],
      daysBack: 14,
      buyer: 'Maya',
      trackingNumber: 'JNT-DEMO-1003',
    },
    {
      channel: 'shopee',
      status: OrderStatus.COMPLETED,
      lines: [{ sku: 'TOTE-NAT', qty: 2 }],
      daysBack: 12,
      buyer: 'Dewi',
      trackingNumber: 'JNE-DEMO-1004',
    },
    {
      channel: 'lazada',
      status: OrderStatus.CANCELLED,
      lines: [{ sku: 'TOPI-KRM', qty: 1 }],
      daysBack: 8,
      buyer: 'Eko',
      cancelReason: 'Pembeli batal — salah pesan',
    },
  ];

  const completedOrders: { id: string; lines: OrderLine[]; trackingNumber: string }[] = [];
  const shippedOrders: { id: string; lines: OrderLine[]; trackingNumber: string }[] = [];
  for (const seed of orderSeeds) {
    orderSeq += 1;
    const conn = connections[seed.channel]!;
    const at = daysAgo(seed.daysBack);
    const priced = seed.lines.map((line) => {
      if (line.unmapped) {
        return {
          ...line,
          price: 65000,
          cost: 0,
          product: line.externalName ?? 'Item',
          variantName: '',
        };
      }
      const v = VARIANTS.find((x) => x.sku === line.sku)!;
      return { ...line, price: v.price, cost: v.cost, product: v.product, variantName: v.name };
    });
    const totalAmount = priced.reduce((sum, l) => sum + l.price * l.qty, 0);
    const shipped = seed.status === OrderStatus.SHIPPED || seed.status === OrderStatus.COMPLETED;
    const reserves = seed.status !== OrderStatus.PENDING; // PENDING hasn't applied inventory yet

    const order = await prisma.order.create({
      data: {
        userId: owner.id,
        organizationId,
        marketplaceConnectionId: conn.id,
        provider: conn.provider,
        externalOrderId: `${conn.shopId}-ORD-${orderSeq}`,
        status: seed.status,
        trackingNumber: seed.trackingNumber ?? null,
        buyerName: seed.buyer,
        totalAmount: rp(totalAmount),
        currency: 'IDR',
        cancelReason: seed.cancelReason ?? null,
        placedAt: at,
        externalUpdatedAt: shipped ? daysAgo(seed.daysBack - 1) : at,
        inventoryAppliedAt: reserves ? at : null,
        inventoryShippedAt: shipped ? at : null,
        inventoryRevertedAt: seed.status === OrderStatus.CANCELLED ? at : null,
        fulfilledAt: shipped && seed.trackingNumber ? at : null,
        items: {
          create: priced.map((l) => ({
            externalProductId: `${conn.shopId}-P?`,
            externalVariantId: `${conn.shopId}-V?`,
            externalSku: l.sku,
            externalName: l.unmapped ? l.product : `${l.product} ${l.variantName}`,
            quantity: l.qty,
            unitPrice: rp(l.price),
            unitCost: l.unmapped ? null : rp(l.cost),
            productVariantId: l.unmapped ? null : state[l.sku]!.id,
          })),
        },
      },
    });

    // Stock lifecycle (resolved lines only): reserve on PAID; reserve+ship on SHIPPED/COMPLETED;
    // reserve+release on CANCELLED. PENDING + unmapped lines move nothing.
    for (const l of priced) {
      if (l.unmapped || !reserves) continue;
      move(l.sku, -l.qty, StockLedgerReason.ORDER_RESERVE, StockLedgerSource.MARKETPLACE, {
        at,
        referenceId: order.id,
        note: `Order ${order.externalOrderId}`,
      });
      if (seed.status === OrderStatus.PAID) {
        state[l.sku]!.reserved += l.qty;
      } else if (shipped) {
        move(l.sku, 0, StockLedgerReason.ORDER_SHIP, StockLedgerSource.MARKETPLACE, {
          at,
          referenceId: order.id,
          note: `Kirim ${order.externalOrderId}`,
        });
      } else if (seed.status === OrderStatus.CANCELLED) {
        move(l.sku, l.qty, StockLedgerReason.ORDER_RELEASE, StockLedgerSource.MARKETPLACE, {
          at,
          referenceId: order.id,
          note: `Batal ${order.externalOrderId}`,
        });
      }
    }
    if (seed.status === OrderStatus.COMPLETED && seed.trackingNumber) {
      completedOrders.push({
        id: order.id,
        lines: seed.lines,
        trackingNumber: seed.trackingNumber,
      });
    }
    if (seed.status === OrderStatus.SHIPPED && seed.trackingNumber) {
      shippedOrders.push({ id: order.id, lines: seed.lines, trackingNumber: seed.trackingNumber });
    }
  }
  console.log(`Orders: ${orderSeq} across PENDING/PAID/SHIPPED/COMPLETED/CANCELLED (+1 unmapped).`);

  // ── Returns: received(restock+damaged) · pending · rejected · auto-detected ─────────────────
  const findOrderItem = async (orderId: string, sku: string) => {
    const row = await prisma.order.findFirst({
      where: { organizationId, id: orderId },
      include: { items: true },
    });
    return row?.items.find((it) => it.externalSku === sku);
  };

  // 1) RECEIVED return with a RESTOCK line AND a DAMAGED line (damaged → into the damaged bucket).
  const recvTarget = completedOrders[0]; // Maya — KAOS-PTH-L + BOTOL-BIRU
  if (recvTarget) {
    const at = daysAgo(10);
    const restockLine = recvTarget.lines[0]!; // KAOS-PTH-L
    const damagedLine = recvTarget.lines[1]!; // BOTOL-BIRU
    const restockItem = await findOrderItem(recvTarget.id, restockLine.sku);
    const damagedItem = await findOrderItem(recvTarget.id, damagedLine.sku);
    const ret = await prisma.return.create({
      data: {
        userId: owner.id,
        organizationId,
        orderId: recvTarget.id,
        status: ReturnStatus.RECEIVED,
        reason: 'Ukuran tidak sesuai · 1 botol penyok',
        trackingNumber: recvTarget.trackingNumber,
        processedAt: at,
        items: {
          create: [
            {
              orderItemId: restockItem?.id ?? 'unknown',
              productVariantId: state[restockLine.sku]!.id,
              quantity: 1,
              disposition: ReturnDisposition.RESTOCK,
            },
            {
              orderItemId: damagedItem?.id ?? 'unknown',
              productVariantId: state[damagedLine.sku]!.id,
              quantity: 1,
              disposition: ReturnDisposition.DAMAGED,
            },
          ],
        },
      },
    });
    move(restockLine.sku, 1, StockLedgerReason.RETURN, StockLedgerSource.MARKETPLACE, {
      at,
      referenceId: ret.id,
      note: 'Retur — restock',
    });
    // Damaged disposition: available unchanged (delta 0), damaged bucket +1.
    move(damagedLine.sku, 0, StockLedgerReason.RETURN, StockLedgerSource.MARKETPLACE, {
      at,
      referenceId: ret.id,
      note: 'Retur — rusak',
    });
    state[damagedLine.sku]!.damaged += 1;
  }

  // 2) PENDING return (opened, awaiting goods — no stock move yet).
  const pendingTarget = completedOrders[1]; // Dewi — TOTE-NAT
  if (pendingTarget) {
    const line = pendingTarget.lines[0]!;
    const item = await findOrderItem(pendingTarget.id, line.sku);
    await prisma.return.create({
      data: {
        userId: staffUser.id,
        organizationId,
        orderId: pendingTarget.id,
        status: ReturnStatus.PENDING,
        reason: 'Barang cacat (klaim pembeli)',
        trackingNumber: pendingTarget.trackingNumber,
        items: {
          create: [
            {
              orderItemId: item?.id ?? 'unknown',
              productVariantId: state[line.sku]!.id,
              quantity: 1,
              disposition: null,
            },
          ],
        },
      },
    });
  }

  // 3) REJECTED return (closed without restock — dispute lost / goods not returned).
  const rejectTarget = shippedOrders[0]; // Sari — HOODIE-ABU-M
  if (rejectTarget) {
    const line = rejectTarget.lines[0]!;
    const item = await findOrderItem(rejectTarget.id, line.sku);
    await prisma.return.create({
      data: {
        userId: owner.id,
        organizationId,
        orderId: rejectTarget.id,
        status: ReturnStatus.REJECTED,
        reason: 'Barang tidak dikembalikan',
        trackingNumber: rejectTarget.trackingNumber,
        processedAt: daysAgo(4),
        items: {
          create: [
            {
              orderItemId: item?.id ?? 'unknown',
              productVariantId: state[line.sku]!.id,
              quantity: 1,
              disposition: null,
            },
          ],
        },
      },
    });
  }

  // 4) AUTO-DETECTED pending return (opened automatically from a post-ship cancellation).
  const autoTarget = shippedOrders[1]; // Andi — TOPI-HTM
  if (autoTarget) {
    const line = autoTarget.lines[0]!;
    const item = await findOrderItem(autoTarget.id, line.sku);
    await prisma.return.create({
      data: {
        userId: owner.id,
        organizationId,
        orderId: autoTarget.id,
        status: ReturnStatus.PENDING,
        autoDetected: true,
        trackingNumber: autoTarget.trackingNumber,
        items: {
          create: [
            {
              orderItemId: item?.id ?? 'unknown',
              productVariantId: state[line.sku]!.id,
              quantity: 1,
              disposition: null,
            },
          ],
        },
      },
    });
  }
  console.log('Returns: received(restock+damaged) · pending · rejected · auto-detected.');

  // ── Purchase orders: draft / ordered / partial / received(HPP blend) / cancelled / bundle ────
  let poSeq = 0;
  type PoLine = {
    sku: string;
    qty: number;
    received: number;
    unitCost?: number;
    bundleName?: string;
  };
  type PoSeed = {
    supplier: 'tekstil' | 'aksesoris' | 'grosir';
    status: PurchaseOrderStatus;
    lines: PoLine[];
    daysBack: number;
    note?: string;
    /** Update each received line's variant.cost to the moving-average HPP after receive. */
    blendCost?: boolean;
  };
  const poSeeds: PoSeed[] = [
    {
      supplier: 'aksesoris',
      status: PurchaseOrderStatus.DRAFT,
      lines: [{ sku: 'TOPI-HTM', qty: 24, received: 0 }],
      daysBack: 1,
      note: 'Draft restock topi best-seller — belum dipesan',
    },
    {
      supplier: 'tekstil',
      status: PurchaseOrderStatus.ORDERED,
      lines: [
        { sku: 'KAOS-HTM-L', qty: 24, received: 0 },
        { sku: 'KAOS-NVY-M', qty: 24, received: 0 },
      ],
      daysBack: 3,
      note: 'Restock kaos low-stock untuk promo akhir bulan',
    },
    {
      supplier: 'tekstil',
      status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
      lines: [{ sku: 'HOODIE-HTM-L', qty: 12, received: 6 }],
      daysBack: 9,
    },
    {
      // RECEIVED with a HIGHER unit cost than the seed cost → variant.cost blends to the moving avg.
      supplier: 'grosir',
      status: PurchaseOrderStatus.RECEIVED,
      lines: [{ sku: 'BOTOL-PINK', qty: 24, received: 24, unitCost: 26000 }],
      daysBack: 16,
      blendCost: true,
    },
    {
      // CANCELLED (pre-receive) — reserves no incoming, no ledger row.
      supplier: 'grosir',
      status: PurchaseOrderStatus.CANCELLED,
      lines: [{ sku: 'BOTOL-BIRU', qty: 24, received: 0 }],
      daysBack: 6,
    },
    {
      // A bundle PO: the PAKET-OOTD components, each line tagged bundleName, cost allocated.
      supplier: 'tekstil',
      status: PurchaseOrderStatus.ORDERED,
      lines: (() => {
        const comps = [
          { sku: 'KAOS-HTM-M', cost: 48000 },
          { sku: 'TOPI-HTM', cost: 32000 },
          { sku: 'TOTE-NAT', cost: 24000 },
        ];
        const alloc = allocateBundleUnitAmounts(
          90000, // bundle buy cost
          comps.map((c) => ({ weightMinor: c.cost, quantity: 1 })),
        );
        return comps.map((c, i) => ({
          sku: c.sku,
          qty: 6,
          received: 0,
          unitCost: alloc[i]!,
          bundleName: 'Paket OOTD Hemat',
        }));
      })(),
      daysBack: 2,
      note: 'PO bundel — komponen Paket OOTD',
    },
  ];
  for (const seed of poSeeds) {
    poSeq += 1;
    const at = daysAgo(seed.daysBack);
    const supplierId = supplierByKey[seed.supplier]!;
    const supplierName = supplierSeeds.find((s) => s.key === seed.supplier)!.name;
    const priced = seed.lines.map((line) => {
      const v = VARIANTS.find((x) => x.sku === line.sku)!;
      return { ...line, cost: line.unitCost ?? v.cost, product: v.product, variantName: v.name };
    });
    const totalCost = priced.reduce((sum, l) => sum + l.cost * l.qty, 0);
    const isDraft = seed.status === PurchaseOrderStatus.DRAFT;
    const isCancelled = seed.status === PurchaseOrderStatus.CANCELLED;
    const fullyReceived = seed.status === PurchaseOrderStatus.RECEIVED;

    const po = await prisma.purchaseOrder.create({
      data: {
        userId: adminUser.id,
        organizationId,
        code: code('PO', poSeq),
        supplierId,
        supplierName,
        status: seed.status,
        note: seed.note ?? null,
        totalCost: rp(totalCost),
        orderedAt: at,
        receivedAt: fullyReceived ? daysAgo(seed.daysBack - 2) : null,
        items: {
          create: priced.map((l) => ({
            productVariantId: state[l.sku]!.id,
            sku: l.sku,
            name: `${l.product} ${l.variantName}`,
            quantity: l.qty,
            receivedQuantity: l.received,
            unitCost: rp(l.cost),
            bundleName: l.bundleName ?? null,
          })),
        },
      },
    });

    for (const l of priced) {
      const outstanding = l.qty - l.received;
      // DRAFT reserves no incoming; CANCELLED released any incoming (net 0 here, received 0).
      if (!isDraft && !isCancelled) {
        state[l.sku]!.incoming += outstanding;
      }
      if (l.received > 0) {
        // Moving-average HPP blend on receive (on-hand BEFORE this receive × old cost + received).
        if (seed.blendCost) {
          const onHand = Math.max(0, state[l.sku]!.available);
          const oldCost = VARIANTS.find((x) => x.sku === l.sku)!.cost;
          const blended =
            onHand + l.received > 0
              ? Math.round((onHand * oldCost + l.received * l.cost) / (onHand + l.received))
              : l.cost;
          await prisma.productVariant.update({
            where: { id: state[l.sku]!.id },
            data: { cost: rp(blended) },
          });
        }
        move(l.sku, l.received, StockLedgerReason.RESTOCK, StockLedgerSource.PURCHASE, {
          at: fullyReceived ? daysAgo(seed.daysBack - 2) : at,
          referenceId: po.id,
          note: `Terima ${po.code}`,
        });
      }
    }
  }
  console.log(
    `Purchasing: ${poSeq} POs (draft / ordered / partial / received / cancelled / bundle).`,
  );

  // ── Stock opname: posted (COMPLETED) + DRAFT (in progress) + CANCELLED ──────────────────────
  let opnameSeq = 0;
  // Posted — variances write a RECONCILE ledger row + correct the cache.
  opnameSeq += 1;
  {
    const opnameAt = daysAgo(11);
    const lines = [
      { sku: 'TOTE-NAT', counted: -2 },
      { sku: 'TOPI-KRM', counted: 1 },
    ];
    const opname = await prisma.stockOpname.create({
      data: {
        userId: staffUser.id,
        organizationId,
        code: code('OP', opnameSeq),
        status: StockOpnameStatus.COMPLETED,
        note: 'Cycle count rak depan',
        startedAt: opnameAt,
        completedAt: opnameAt,
        items: {
          create: lines.map((l) => {
            const system = state[l.sku]!.available;
            return {
              productVariantId: state[l.sku]!.id,
              sku: l.sku,
              name: `${VARIANTS.find((v) => v.sku === l.sku)!.product} ${VARIANTS.find((v) => v.sku === l.sku)!.name}`,
              systemQuantity: system,
              countedQuantity: system + l.counted,
              variance: l.counted,
            };
          }),
        },
      },
    });
    for (const l of lines) {
      if (l.counted !== 0) {
        move(l.sku, l.counted, StockLedgerReason.RECONCILE, StockLedgerSource.MANUAL, {
          at: opnameAt,
          referenceId: opname.id,
          note: `Opname ${opname.code}`,
        });
      }
    }
  }
  // DRAFT — counting in progress: lines snapshot system qty + a count, but NO ledger/inventory effect.
  opnameSeq += 1;
  {
    const lines = [
      { sku: 'BOTOL-BIRU', counted: 0 },
      { sku: 'KAOSKAKI-SPT', counted: -3 },
    ];
    await prisma.stockOpname.create({
      data: {
        userId: staffUser.id,
        organizationId,
        code: code('OP', opnameSeq),
        status: StockOpnameStatus.DRAFT,
        note: 'Hitung rak gudang — lanjut besok',
        startedAt: daysAgo(1),
        items: {
          create: lines.map((l) => {
            const system = state[l.sku]!.available;
            return {
              productVariantId: state[l.sku]!.id,
              sku: l.sku,
              name: `${VARIANTS.find((v) => v.sku === l.sku)!.product} ${VARIANTS.find((v) => v.sku === l.sku)!.name}`,
              systemQuantity: system,
              countedQuantity: system + l.counted,
              variance: l.counted,
            };
          }),
        },
      },
    });
  }
  // CANCELLED — read-only variance report, applied nothing.
  opnameSeq += 1;
  {
    const sku = 'TOPI-HTM';
    const system = state[sku]!.available;
    await prisma.stockOpname.create({
      data: {
        userId: adminUser.id,
        organizationId,
        code: code('OP', opnameSeq),
        status: StockOpnameStatus.CANCELLED,
        note: 'Dibatalkan — salah rak',
        startedAt: daysAgo(13),
        completedAt: daysAgo(13),
        items: {
          create: [
            {
              productVariantId: state[sku]!.id,
              sku,
              name: 'Topi Baseball Hitam',
              systemQuantity: system,
              countedQuantity: system + 4,
              variance: 4,
            },
          ],
        },
      },
    });
  }
  console.log(`Opname: ${opnameSeq} sessions (posted / draft / cancelled).`);

  // ── Recordings (packing videos: completed + one failed) + share links ───────────────────────
  let storageUsedBytes = 0;
  const recordingResis = ['JNE-DEMO-1001', 'JNT-DEMO-1003', 'WALK-IN-DEMO-9001'];
  let firstRecordingId = '';
  for (let i = 0; i < recordingResis.length; i += 1) {
    const resi = recordingResis[i]!;
    const sizeBytes = 2_400_000 + i * 500_000;
    storageUsedBytes += sizeBytes;
    const rec = await prisma.recording.create({
      data: {
        userId: staffUser.id,
        organizationId,
        trackingNumber: resi,
        generatedFilename: `demo-pack-${i + 1}.webm`,
        storageProvider: 'cloudflare-r2',
        storageBucket: 'palka-recordings',
        storageKey: `${organizationId}/demo-pack-${i + 1}.webm`,
        publicUrl: `https://example.r2.dev/${organizationId}/demo-pack-${i + 1}.webm`,
        mimeType: 'video/webm',
        fileSizeBytes: BigInt(sizeBytes),
        durationSeconds: 75 + i * 20,
        status: RecordingStatus.COMPLETED,
        startedAt: daysAgo(7 - i),
        stoppedAt: daysAgo(7 - i),
        uploadedAt: daysAgo(7 - i),
      },
    });
    if (i === 0) firstRecordingId = rec.id;
  }
  // A FAILED recording (upload interrupted) — exercises the failure/recovery surface; 0 bytes.
  await prisma.recording.create({
    data: {
      userId: staffUser.id,
      organizationId,
      trackingNumber: 'JNE-DEMO-FAIL-1',
      generatedFilename: 'demo-pack-failed.webm',
      storageProvider: 'cloudflare-r2',
      storageBucket: 'palka-recordings',
      storageKey: `${organizationId}/demo-pack-failed.webm`,
      publicUrl: 'pending',
      mimeType: 'video/webm',
      fileSizeBytes: BigInt(0),
      durationSeconds: 42,
      status: RecordingStatus.FAILED,
      failureCode: 'UPLOAD_FAILED',
      failureReason: 'Koneksi terputus saat unggah',
      startedAt: daysAgo(2),
      stoppedAt: daysAgo(2),
      uploadedAt: null,
    },
  });
  // Share links on the first recording: one active, one revoked.
  await prisma.recordingShareLink.create({
    data: {
      userId: staffUser.id,
      organizationId,
      recordingId: firstRecordingId,
      tokenHash: tokenHash('demo-share-active-token'),
      expiresAt: daysAgo(-7),
      viewCount: 3,
      lastViewedAt: daysAgo(1),
      createdAt: daysAgo(5),
    },
  });
  await prisma.recordingShareLink.create({
    data: {
      userId: staffUser.id,
      organizationId,
      recordingId: firstRecordingId,
      tokenHash: tokenHash('demo-share-revoked-token'),
      expiresAt: daysAgo(-1),
      revokedAt: daysAgo(2),
      viewCount: 1,
      lastViewedAt: daysAgo(3),
      createdAt: daysAgo(6),
    },
  });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { storageUsedBytes: BigInt(storageUsedBytes) },
  });
  console.log(`Recordings: 3 completed + 1 failed + 2 share links (storage ${storageUsedBytes}B).`);

  // ── Notifications (rich types + categories · targeted · multi-member read state) ────────────
  type NotifSeed = {
    type: NotificationType;
    category: NotificationCategory;
    severity: NotificationSeverity;
    title: string;
    body: string;
    href: string;
    days: number;
    read: boolean;
    recipientUserId?: string;
    entityType?: string;
    entityId?: string;
    readByStaff?: boolean;
  };
  const notifSeeds: NotifSeed[] = [
    {
      type: NotificationType.RESTOCK_URGENT,
      category: NotificationCategory.INVENTORY,
      severity: NotificationSeverity.URGENT,
      title: 'Stok kritis: Kaos Polos Premium Navy / M',
      body: 'Sisa 6 — di bawah ambang. Buat PO sekarang.',
      href: '/dashboard/inventory/reorder',
      days: 1,
      read: false,
    },
    {
      type: NotificationType.LOW_STOCK,
      category: NotificationCategory.INVENTORY,
      severity: NotificationSeverity.WARNING,
      title: 'Stok menipis: Hoodie Fleece Hitam / L',
      body: 'Sisa 5 unit.',
      href: '/dashboard/inventory',
      days: 2,
      read: true,
    },
    {
      type: NotificationType.ORDER_PLACED,
      category: NotificationCategory.ORDERS,
      severity: NotificationSeverity.INFO,
      title: 'Pesanan baru dari Lazada',
      body: 'Rina memesan 2× Kaos Putih / M.',
      href: '/dashboard/orders',
      days: 5,
      read: false,
    },
    {
      type: NotificationType.SALE_REFUNDED,
      category: NotificationCategory.SALES,
      severity: NotificationSeverity.INFO,
      title: 'Refund RF00001 diproses',
      body: '2× Kaos Kaki Sport dikembalikan.',
      href: '/dashboard/sales',
      days: 3,
      read: true,
    },
    {
      type: NotificationType.PURCHASE_RECEIVED,
      category: NotificationCategory.PURCHASING,
      severity: NotificationSeverity.SUCCESS,
      title: 'PO00004 diterima penuh',
      body: '24× Botol Minum Pink masuk stok.',
      href: '/dashboard/purchasing',
      days: 14,
      read: true,
    },
    {
      type: NotificationType.MARKETPLACE_SYNC_FAILED,
      category: NotificationCategory.MARKETPLACE,
      severity: NotificationSeverity.WARNING,
      title: 'Sinkronisasi stok gagal (Lazada)',
      body: 'Satu listing ditolak provider — cek kesehatan channel.',
      href: '/dashboard/marketplace',
      days: 1,
      read: false,
    },
    {
      type: NotificationType.TEAM_MEMBER_JOINED,
      category: NotificationCategory.TEAM,
      severity: NotificationSeverity.INFO,
      title: 'Anggota baru bergabung',
      body: 'Staf Kasir bergabung sebagai STAFF.',
      href: '/settings',
      days: 30,
      read: true,
    },
    {
      type: NotificationType.RETURN_PROCESSED,
      category: NotificationCategory.RETURNS,
      severity: NotificationSeverity.SUCCESS,
      title: 'Retur diproses',
      body: 'Kaos Putih / L direstock, 1 botol masuk rusak.',
      href: '/dashboard/returns',
      days: 10,
      read: false,
      entityType: 'return',
    },
    {
      type: NotificationType.OPNAME_POSTED,
      category: NotificationCategory.INVENTORY,
      severity: NotificationSeverity.INFO,
      title: 'Opname OP00001 diposting',
      body: 'Selisih dua item ditulis ke kartu stok.',
      href: '/dashboard/inventory/opname',
      days: 11,
      read: true,
    },
    {
      type: NotificationType.DEAD_STOCK_CAPITAL,
      category: NotificationCategory.INVENTORY,
      severity: NotificationSeverity.WARNING,
      title: 'Modal mengendap di stok mati',
      body: 'Pin Enamel belum terjual > 60 hari.',
      href: '/dashboard/reports/dead-stock',
      days: 1,
      read: false,
    },
    {
      type: NotificationType.SALE_BELOW_COST,
      category: NotificationCategory.SALES,
      severity: NotificationSeverity.WARNING,
      title: 'Penjualan di bawah modal',
      body: `${belowCostSaleCode}: Hoodie Abu / L dijual di bawah HPP.`,
      href: '/dashboard/sales',
      days: 3,
      read: false,
    },
    {
      // Targeted to STAFF only (per-recipient query) — unread for staff.
      type: NotificationType.ORDERS_TO_SHIP,
      category: NotificationCategory.ORDERS,
      severity: NotificationSeverity.INFO,
      title: 'Ada pesanan siap dikirim',
      body: 'Dua pesanan PAID menunggu dikemas.',
      href: '/dashboard/orders/board',
      days: 1,
      read: false,
      recipientUserId: staffUser.id,
    },
  ];
  for (let i = 0; i < notifSeeds.length; i += 1) {
    const n = notifSeeds[i]!;
    const notif = await prisma.notification.create({
      data: {
        organizationId,
        recipientUserId: n.recipientUserId ?? null,
        actorUserId: owner.id,
        type: n.type,
        category: n.category,
        severity: n.severity,
        title: n.title,
        body: n.body,
        href: n.href,
        dedupeKey: `demo-notif-${i + 1}`,
        entityType: n.entityType ?? null,
        createdAt: daysAgo(n.days),
      },
    });
    if (n.read) {
      await prisma.notificationRead.create({
        data: { notificationId: notif.id, userId: owner.id, readAt: daysAgo(n.days) },
      });
      // A couple also read by the admin so the multi-member read-state join is demonstrated.
      if (i % 3 === 0) {
        await prisma.notificationRead.create({
          data: { notificationId: notif.id, userId: adminUser.id, readAt: daysAgo(n.days) },
        });
      }
    }
  }
  console.log(`Notifications: ${notifSeeds.length} (rich types, targeted, multi-member reads).`);

  // Per-member notification preferences: STAFF opts OUT of MARKETPLACE + PURCHASING (IN_APP).
  await prisma.notificationPreference.createMany({
    data: [
      {
        organizationId,
        userId: staffUser.id,
        category: NotificationCategory.MARKETPLACE,
        enabled: false,
      },
      {
        organizationId,
        userId: staffUser.id,
        category: NotificationCategory.PURCHASING,
        enabled: false,
      },
    ],
  });

  // ── Team invites (pending STAFF + pending ADMIN + a used + a revoked) ────────────────────────
  await prisma.organizationInvite.create({
    data: {
      organizationId,
      code: 'K7QMVR9X',
      role: OrgRole.STAFF,
      expiresAt: daysAgo(-7),
      createdByUserId: owner.id,
      createdAt: daysAgo(1),
    },
  });
  await prisma.organizationInvite.create({
    data: {
      organizationId,
      code: 'TZ4PWH8B',
      role: OrgRole.ADMIN,
      expiresAt: daysAgo(-5),
      createdByUserId: owner.id,
      createdAt: daysAgo(2),
    },
  });
  await prisma.organizationInvite.create({
    data: {
      organizationId,
      code: 'M9XQ7VK2',
      role: OrgRole.STAFF,
      expiresAt: daysAgo(33),
      createdByUserId: owner.id,
      usedByUserId: staffUser.id,
      usedAt: daysAgo(40),
      createdAt: daysAgo(45),
    },
  });
  await prisma.organizationInvite.create({
    data: {
      organizationId,
      code: 'R3HQNP6T',
      role: OrgRole.STAFF,
      expiresAt: daysAgo(-2),
      createdByUserId: owner.id,
      revokedAt: daysAgo(3),
      createdAt: daysAgo(8),
    },
  });
  console.log('Team: 4 invites (pending staff/admin + used + revoked).');

  // ── Write the simulated inventory + the full ledger history ────────────────────────────────
  for (const v of VARIANTS) {
    const s = state[v.sku]!;
    await prisma.inventory.create({
      data: {
        variantId: s.id,
        availableStock: Math.max(0, s.available),
        reservedStock: s.reserved,
        damagedStock: s.damaged,
        incomingStock: s.incoming,
        lastAdjustedAt: new Date(),
      },
    });
  }
  // balanceAfter must read as the running available balance in CHRONOLOGICAL order (how the stock
  // activity log shows it). move() accumulated state in code order (correct for the net Inventory
  // write, since a sum is order-independent), but the per-row balanceAfter has to be replayed by
  // createdAt so the saldo column is monotonic and the last chronological row == Inventory.available.
  ledger.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()); // stable
  const runningByVariant: Record<string, number> = {};
  for (const row of ledger) {
    runningByVariant[row.variantId] = (runningByVariant[row.variantId] ?? 0) + row.delta;
    row.balanceAfter = runningByVariant[row.variantId]!;
  }
  await prisma.stockLedger.createMany({ data: ledger });
  console.log(`Inventory + ${ledger.length} ledger rows written.`);

  // ── Audit log ──────────────────────────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      {
        userId: staffUser.id,
        organizationId,
        action: 'sale.created',
        resource: 'sale',
        ipAddress: loginIp,
        metadata: { code: 'S00008' } as Prisma.InputJsonValue,
        createdAt: daysAgo(1),
      },
      {
        userId: adminUser.id,
        organizationId,
        action: 'purchase.received',
        resource: 'purchase_order',
        metadata: { code: 'PO00004' } as Prisma.InputJsonValue,
        createdAt: daysAgo(14),
      },
      {
        userId: staffUser.id,
        organizationId,
        action: 'opname.posted',
        resource: 'stock_opname',
        metadata: { code: 'OP00001' } as Prisma.InputJsonValue,
        createdAt: daysAgo(11),
      },
      {
        userId: owner.id,
        organizationId,
        action: 'team.invite.created',
        resource: 'organization_invite',
        ipAddress: loginIp,
        metadata: { role: 'STAFF' } as Prisma.InputJsonValue,
        createdAt: daysAgo(1),
      },
      {
        userId: owner.id,
        organizationId,
        action: 'return.processed',
        resource: 'return',
        metadata: { disposition: 'RESTOCK+DAMAGED' } as Prisma.InputJsonValue,
        createdAt: daysAgo(10),
      },
      {
        userId: owner.id,
        organizationId,
        action: 'supplier.created',
        resource: 'supplier',
        metadata: { name: 'PT Tekstil Jaya' } as Prisma.InputJsonValue,
        createdAt: daysAgo(40),
      },
    ],
  });

  // ── Finance: recurring templates, budgets, opex ledger (manual + recurring + auto-fee) ───────
  const ym = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = ym(new Date());

  const rentTemplate = await prisma.expenseTemplate.create({
    data: {
      userId: owner.id,
      organizationId,
      category: ExpenseCategory.RENT,
      amount: '2500000',
      dayOfMonth: 1,
      note: 'Sewa ruko bulanan',
      isActive: true,
    },
  });
  const salaryTemplate = await prisma.expenseTemplate.create({
    data: {
      userId: owner.id,
      organizationId,
      category: ExpenseCategory.SALARY,
      amount: '3000000',
      dayOfMonth: 25,
      note: 'Gaji staf',
      isActive: true,
    },
  });

  // Monthly budgets per category — UTILITIES is set tight so it shows OVER-budget in the demo.
  await prisma.budget.createMany({
    data: [
      {
        userId: owner.id,
        organizationId,
        category: ExpenseCategory.ADVERTISING,
        amount: '2000000',
      },
      { userId: owner.id, organizationId, category: ExpenseCategory.PACKAGING, amount: '1000000' },
      { userId: owner.id, organizationId, category: ExpenseCategory.SALARY, amount: '3500000' },
      { userId: owner.id, organizationId, category: ExpenseCategory.RENT, amount: '2500000' },
      { userId: owner.id, organizationId, category: ExpenseCategory.UTILITIES, amount: '700000' },
    ],
  });

  // A spread of opex across this month + last, mixing manual / recurring / auto-fee sources so
  // the ledger flags, the Net P&L, and the budget-vs-actual all show realistic data.
  const expenseSeeds: Array<{
    category: ExpenseCategory;
    amount: string;
    day: number;
    note: string;
    templateId?: string;
    autoSourceKey?: string;
  }> = [
    {
      category: ExpenseCategory.ADVERTISING,
      amount: '850000',
      day: 4,
      note: 'Iklan FB minggu ini',
    },
    { category: ExpenseCategory.ADVERTISING, amount: '650000', day: 11, note: 'Iklan TikTok' },
    { category: ExpenseCategory.PACKAGING, amount: '420000', day: 6, note: 'Bubble wrap + kardus' },
    {
      category: ExpenseCategory.SHIPPING_SUBSIDY,
      amount: '300000',
      day: 8,
      note: 'Subsidi ongkir promo',
    },
    { category: ExpenseCategory.UTILITIES, amount: '760000', day: 13, note: 'Listrik + internet' },
    { category: ExpenseCategory.OTHER, amount: '180000', day: 16, note: 'ATK + lain-lain' },
    {
      category: ExpenseCategory.RENT,
      amount: '2500000',
      day: 20,
      note: 'Sewa ruko bulanan',
      templateId: rentTemplate.id,
    },
    {
      category: ExpenseCategory.SALARY,
      amount: '3000000',
      day: 2,
      note: 'Gaji staf',
      templateId: salaryTemplate.id,
    },
    {
      category: ExpenseCategory.PAYMENT_FEE,
      amount: '63000',
      day: 19,
      note: 'Estimasi fee QRIS',
      autoSourceKey: `qris-fee:${thisMonth}`,
    },
    {
      category: ExpenseCategory.MARKETPLACE_COMMISSION,
      amount: '210000',
      day: 19,
      note: 'Komisi Toko Palka (Lazada)',
      autoSourceKey: `mp-commission:${connections.lazada!.id}:${thisMonth}`,
    },
    { category: ExpenseCategory.ADVERTISING, amount: '1200000', day: 38, note: 'Iklan bulan lalu' },
    { category: ExpenseCategory.RENT, amount: '2500000', day: 36, note: 'Sewa bulan lalu' },
  ];
  for (const e of expenseSeeds) {
    const generated = e.templateId !== undefined || e.autoSourceKey !== undefined;
    await prisma.expense.create({
      data: {
        userId: owner.id,
        organizationId,
        category: e.category,
        amount: e.amount,
        date: daysAgo(e.day),
        note: e.note,
        ...(e.templateId ? { templateId: e.templateId } : {}),
        ...(e.autoSourceKey ? { autoSourceKey: e.autoSourceKey } : {}),
        ...(generated ? { periodMonth: thisMonth } : {}),
      },
    });
  }
  console.log(
    `Finance: ${expenseSeeds.length} expenses (manual/recurring/auto-fee), 2 templates, 5 budgets, fee rates set.`,
  );

  console.log('\n✅ Demo org seeded. Sign in (password for all):', PASSWORD);
  console.log(`   OWNER  ${OWNER_EMAIL}`);
  console.log(`   ADMIN  ${ADMIN_EMAIL}`);
  console.log(`   STAFF  ${STAFF_EMAIL}`);
}

main()
  .catch((error) => {
    console.error('Demo seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
