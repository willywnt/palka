/**
 * Comprehensive demo seed: ONE organization ("Toko Falka Demo") with three sign-ins
 * (OWNER / ADMIN / STAFF) and rich, internally-consistent data across every feature, so a
 * fresh login looks complete and "alive":
 *   suppliers · catalog (products + grouped variants + a bundle) · inventory + a real ledger
 *   history · POS sales (with discount/PPN + a partial refund) · marketplace connections +
 *   mapped listings + sync jobs · marketplace orders across all statuses · a processed return ·
 *   purchase orders (ordered / partial / received) · a posted stock-opname · packing recordings ·
 *   notifications · audit log.
 *
 * Idempotent by existence: if the demo org already has products it only re-asserts the three
 * accounts and exits (re-run safely; to fully re-seed, drop the org or use a fresh DB).
 *
 * Run: pnpm --filter @falka/db db:seed-demo   (needs DATABASE_URL + DIRECT_URL in .env)
 */
import { DEFAULT_STORAGE_QUOTA_BYTES } from '@falka/config/limits';
import {
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
const OWNER_EMAIL = 'pemilik@tokodemo.local';
const ADMIN_EMAIL = 'admin@tokodemo.local';
const STAFF_EMAIL = 'staf@tokodemo.local';
const ORG_NAME = 'Toko Falka Demo';

const DAY = 86_400_000;
const daysAgo = (n: number): Date => new Date(Date.now() - n * DAY);
const rp = (n: number): string => String(Math.round(n));
const code = (prefix: string, n: number): string => `${prefix}${String(n).padStart(5, '0')}`;

/**
 * `--fresh` (or SEED_FRESH=1) wipes the demo org's existing data before reseeding, so a re-run
 * gives a clean, fully-refreshed demo. Without it the seed is idempotent (skips if data exists).
 */
const FRESH = process.argv.includes('--fresh') || process.env.SEED_FRESH === '1';

/**
 * Delete ALL of the demo org's feature data, scoped to `organizationId` only (never touches
 * another org). FK-safe order: rows a parent cascades (order→items/returns, sale→items/refunds,
 * connection-owned products/mappings/jobs, PO/opname/bundle items, notification reads) go via
 * their parent; the StockLedger is cleared before variants (its variant FK is Restrict).
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
  await prisma.recording.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } }); // cascades notificationReads
  await prisma.stockLedger.deleteMany({ where: { organizationId } }); // before variants (FK Restrict)
  await prisma.productVariant.deleteMany({ where: { organizationId } }); // cascades inventory
  await prisma.product.deleteMany({ where: { organizationId } });
  await prisma.supplier.deleteMany({ where: { organizationId } });
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
  },
  {
    sku: 'KAOS-HTM-L',
    product: 'Kaos Polos Premium',
    group: 'Kaos Polos Premium',
    name: 'Hitam / L',
    price: 95000,
    cost: 48000,
    initial: 8,
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
    sku: 'KAOS-NVY-M',
    product: 'Kaos Polos Premium',
    group: 'Kaos Polos Premium',
    name: 'Navy / M',
    price: 95000,
    cost: 48000,
    initial: 6,
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

  // ── Accounts + org (OWNER's id == org id, matching the storage-key convention) ───────────
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { displayName: 'Pemilik Toko', passwordHash, role: UserRole.USER },
    create: { email: OWNER_EMAIL, displayName: 'Pemilik Toko', passwordHash, role: UserRole.USER },
  });
  const organizationId = owner.id;
  const org = await prisma.organization.upsert({
    where: { id: organizationId },
    update: { name: ORG_NAME },
    create: {
      id: organizationId,
      name: ORG_NAME,
      storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
      plan: 'Demo',
      memberLimit: 10,
    },
  });
  await prisma.organizationMember.upsert({
    where: { userId: owner.id },
    update: { organizationId, role: OrgRole.OWNER },
    create: { organizationId, userId: owner.id, role: OrgRole.OWNER },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { displayName: 'Admin Gudang', passwordHash, role: UserRole.USER },
    create: { email: ADMIN_EMAIL, displayName: 'Admin Gudang', passwordHash, role: UserRole.USER },
  });
  await prisma.organizationMember.upsert({
    where: { userId: adminUser.id },
    update: { organizationId, role: OrgRole.ADMIN },
    create: { organizationId, userId: adminUser.id, role: OrgRole.ADMIN },
  });

  const staffUser = await prisma.user.upsert({
    where: { email: STAFF_EMAIL },
    update: { displayName: 'Staf Kasir', passwordHash, role: UserRole.USER },
    create: { email: STAFF_EMAIL, displayName: 'Staf Kasir', passwordHash, role: UserRole.USER },
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
        variantGroup: v.group ?? null,
        price: rp(v.price),
        cost: rp(v.cost),
        lowStockThreshold: v.lowStock,
        leadTimeDays: v.leadTimeDays ?? null,
        minOrderQty: v.minOrderQty ?? null,
        supplierId: v.supplier ? supplierByKey[v.supplier] : null,
      },
    });
    state[v.sku] = { id: variant.id, available: 0, reserved: 0, damaged: 0, incoming: 0 };
    move(v.sku, v.initial, StockLedgerReason.RESTOCK, StockLedgerSource.MANUAL, {
      at: daysAgo(40),
      note: 'Stok awal',
    });
  }
  console.log(
    `Catalog: ${Object.keys(productByName).length} products · ${VARIANTS.length} variants.`,
  );

  // ── Bundle ───────────────────────────────────────────────────────────────────────────────
  const bundle = await prisma.bundle.create({
    data: {
      userId: owner.id,
      organizationId,
      sku: 'PAKET-OOTD',
      name: 'Paket OOTD Hemat',
      price: rp(210000),
      items: {
        create: [
          { productVariantId: state['KAOS-HTM-M']!.id, quantity: 1 },
          { productVariantId: state['TOPI-HTM']!.id, quantity: 1 },
          { productVariantId: state['TOTE-NAT']!.id, quantity: 1 },
        ],
      },
    },
  });
  console.log(`Bundle: ${bundle.name}.`);

  // ── POS sales (discount + PPN + one partial refund) ─────────────────────────────────────────
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
    refundQtyFirstLine?: number;
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
    },
    {
      lines: [{ sku: 'HOODIE-ABU-M', qty: 1 }],
      payment: SalePaymentMethod.QRIS,
      discount: 20000,
      taxRate: 0,
      taxInclusive: false,
      daysBack: 15,
      actor: staffUser.id,
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
    },
    {
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
      payment: SalePaymentMethod.CASH,
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
    const status = seed.refundQtyFirstLine ? SaleStatus.PARTIALLY_REFUNDED : SaleStatus.COMPLETED;

    const sale = await prisma.sale.create({
      data: {
        userId: seed.actor,
        organizationId,
        code: code('S', saleSeq),
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

    if (seed.refundQtyFirstLine) {
      refundSeq += 1;
      const refundedAt = daysAgo(seed.daysBack - 1);
      const firstLine = sale.items[0]!;
      const firstSeed = priced[0]!;
      const netUnit = firstSeed.price; // no PPN on this sale; discount is on the line but refund values the net unit simply
      const refundAmount = netUnit * seed.refundQtyFirstLine;
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
  }
  console.log(`POS: ${saleSeq} sales (incl. ${refundSeq} partial refund).`);

  // ── Marketplace connections + mapped listings + sync jobs ──────────────────────────────────
  const connections: Record<string, { id: string; shopId: string; provider: MarketplaceProvider }> =
    {};
  const connectionSeeds = [
    {
      key: 'lazada',
      provider: MarketplaceProvider.LAZADA,
      shopId: 'demo-lazada-01',
      shopName: 'Toko Falka (Lazada)',
    },
    {
      key: 'shopee',
      provider: MarketplaceProvider.SHOPEE,
      shopId: 'demo-shopee-01',
      shopName: 'Toko Falka (Shopee)',
    },
    {
      key: 'tokopedia',
      provider: MarketplaceProvider.TOKOPEDIA,
      shopId: 'demo-tokopedia-01',
      shopName: 'Toko Falka (Tokopedia)',
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
        encryptedAccessToken: 'demo-encrypted-token',
        encryptedRefreshToken: 'demo-encrypted-refresh',
        tokenExpiresAt: daysAgo(-20),
        isActive: true,
        lastImportedAt: daysAgo(3),
        knownWarehouseCodes: [],
      },
    });
    connections[c.key] = { id: conn.id, shopId: c.shopId, provider: c.provider };
  }

  // Map most variants on Lazada + Shopee; leave a couple NEEDS_REVIEW (sync off) on Shopee.
  const mappedSkus = VARIANTS.slice(0, 8);
  for (const channel of ['lazada', 'shopee'] as const) {
    const conn = connections[channel]!;
    let idx = 0;
    for (const v of mappedSkus) {
      idx += 1;
      const needsReview = channel === 'shopee' && idx > 6;
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
          stock: state[v.sku]!.available,
          status: 'ACTIVE',
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
          autoMapped: true,
          lastSyncedAt: needsReview ? null : daysAgo(1),
          lastSyncStatus: needsReview ? null : MarketplaceSyncStatus.SYNCED,
        },
      });
      // A couple of sync-job rows so the health panel + badges have history (one FAILED on Lazada).
      const failed = channel === 'lazada' && idx === 2;
      await prisma.marketplaceSyncJob.create({
        data: {
          userId: owner.id,
          organizationId,
          marketplaceConnectionId: conn.id,
          marketplaceProductMappingId: mapping.id,
          provider: conn.provider,
          idempotencyKey: `demo-sync:${mapping.id}:${idx}`,
          syncStatus: failed ? MarketplaceSyncJobStatus.FAILED : MarketplaceSyncJobStatus.SUCCESS,
          payload: { availableStock: state[v.sku]!.available } as Prisma.InputJsonValue,
          attempts: failed ? 3 : 1,
          errorMessage: failed ? 'Provider menolak: item terkunci (demo).' : null,
          completedAt: daysAgo(1),
        },
      });
    }
  }
  console.log('Marketplace: 3 connections, mapped listings (Lazada + Shopee) + sync jobs.');

  // ── Marketplace orders across statuses ─────────────────────────────────────────────────────
  let orderSeq = 0;
  type OrderSeed = {
    channel: 'lazada' | 'shopee';
    status: OrderStatus;
    lines: SaleLine[];
    daysBack: number;
    buyer: string;
    noResi?: string;
  };
  const orderSeeds: OrderSeed[] = [
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
      channel: 'lazada',
      status: OrderStatus.SHIPPED,
      lines: [{ sku: 'HOODIE-ABU-M', qty: 1 }],
      daysBack: 7,
      buyer: 'Sari',
      noResi: 'JNE-DEMO-1001',
    },
    {
      channel: 'shopee',
      status: OrderStatus.SHIPPED,
      lines: [{ sku: 'TOPI-HTM', qty: 2 }],
      daysBack: 6,
      buyer: 'Andi',
      noResi: 'SICEPAT-DEMO-1002',
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
      noResi: 'JNT-DEMO-1003',
    },
    {
      channel: 'shopee',
      status: OrderStatus.COMPLETED,
      lines: [{ sku: 'TOTE-NAT', qty: 2 }],
      daysBack: 12,
      buyer: 'Dewi',
      noResi: 'JNE-DEMO-1004',
    },
    {
      channel: 'lazada',
      status: OrderStatus.CANCELLED,
      lines: [{ sku: 'TOPI-KRM', qty: 1 }],
      daysBack: 8,
      buyer: 'Eko',
    },
  ];

  const completedOrders: { id: string; lines: SaleLine[]; noResi: string }[] = [];
  for (const seed of orderSeeds) {
    orderSeq += 1;
    const conn = connections[seed.channel]!;
    const at = daysAgo(seed.daysBack);
    const priced = seed.lines.map((line) => {
      const v = VARIANTS.find((x) => x.sku === line.sku)!;
      return { ...line, price: v.price, cost: v.cost, product: v.product, variantName: v.name };
    });
    const totalAmount = priced.reduce((sum, l) => sum + l.price * l.qty, 0);
    const shipped = seed.status === OrderStatus.SHIPPED || seed.status === OrderStatus.COMPLETED;

    const order = await prisma.order.create({
      data: {
        userId: owner.id,
        organizationId,
        marketplaceConnectionId: conn.id,
        provider: conn.provider,
        externalOrderId: `${conn.shopId}-ORD-${orderSeq}`,
        status: seed.status,
        noResi: seed.noResi ?? null,
        buyerName: seed.buyer,
        totalAmount: rp(totalAmount),
        currency: 'IDR',
        placedAt: at,
        inventoryAppliedAt: at,
        inventoryShippedAt: shipped ? at : null,
        inventoryRevertedAt: seed.status === OrderStatus.CANCELLED ? at : null,
        fulfilledAt: shipped && seed.noResi ? at : null,
        items: {
          create: priced.map((l) => ({
            externalProductId: `${conn.shopId}-P?`,
            externalVariantId: `${conn.shopId}-V?`,
            externalSku: l.sku,
            externalName: `${l.product} ${l.variantName}`,
            quantity: l.qty,
            unitPrice: rp(l.price),
            unitCost: rp(l.cost),
            productVariantId: state[l.sku]!.id,
          })),
        },
      },
    });

    // Stock lifecycle: reserve on PAID; reserve+ship on SHIPPED/COMPLETED; reserve+release on CANCELLED.
    for (const l of priced) {
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
    if (seed.status === OrderStatus.COMPLETED && seed.noResi) {
      completedOrders.push({ id: order.id, lines: seed.lines, noResi: seed.noResi });
    }
  }
  console.log(`Orders: ${orderSeq} across PAID/SHIPPED/COMPLETED/CANCELLED.`);

  // ── A processed return (RMA) on a completed order ──────────────────────────────────────────
  const returnTarget = completedOrders[0];
  if (returnTarget) {
    const at = daysAgo(10);
    const returnLine = returnTarget.lines[0]!;
    const orderRow = await prisma.order.findFirst({
      where: { organizationId, id: returnTarget.id },
      include: { items: true },
    });
    const orderItem = orderRow?.items.find((it) => it.externalSku === returnLine.sku);
    const ret = await prisma.return.create({
      data: {
        userId: owner.id,
        organizationId,
        orderId: returnTarget.id,
        status: ReturnStatus.RECEIVED,
        reason: 'Ukuran tidak sesuai',
        noResi: returnTarget.noResi,
        processedAt: at,
        items: {
          create: [
            {
              orderItemId: orderItem?.id ?? 'unknown',
              productVariantId: state[returnLine.sku]!.id,
              quantity: 1,
              disposition: ReturnDisposition.RESTOCK,
            },
          ],
        },
      },
    });
    move(returnLine.sku, 1, StockLedgerReason.RETURN, StockLedgerSource.MARKETPLACE, {
      at,
      referenceId: ret.id,
      note: 'Retur — restock',
    });
    console.log('Returns: 1 processed (restock).');
  }

  // ── Purchase orders (ordered / partially received / received) ──────────────────────────────
  let poSeq = 0;
  type PoSeed = {
    supplier: 'tekstil' | 'aksesoris' | 'grosir';
    status: PurchaseOrderStatus;
    lines: { sku: string; qty: number; received: number }[];
    daysBack: number;
  };
  const poSeeds: PoSeed[] = [
    {
      supplier: 'tekstil',
      status: PurchaseOrderStatus.ORDERED,
      lines: [
        { sku: 'KAOS-HTM-L', qty: 24, received: 0 },
        { sku: 'KAOS-NVY-M', qty: 24, received: 0 },
      ],
      daysBack: 3,
    },
    {
      supplier: 'tekstil',
      status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
      lines: [{ sku: 'HOODIE-HTM-L', qty: 12, received: 6 }],
      daysBack: 9,
    },
    {
      supplier: 'grosir',
      status: PurchaseOrderStatus.RECEIVED,
      lines: [{ sku: 'BOTOL-PINK', qty: 24, received: 24 }],
      daysBack: 16,
    },
  ];
  for (const seed of poSeeds) {
    poSeq += 1;
    const at = daysAgo(seed.daysBack);
    const supplierId = supplierByKey[seed.supplier]!;
    const supplierName = supplierSeeds.find((s) => s.key === seed.supplier)!.name;
    const priced = seed.lines.map((line) => {
      const v = VARIANTS.find((x) => x.sku === line.sku)!;
      return { ...line, cost: v.cost, product: v.product, variantName: v.name };
    });
    const totalCost = priced.reduce((sum, l) => sum + l.cost * l.qty, 0);
    const fullyReceived = seed.status === PurchaseOrderStatus.RECEIVED;

    const po = await prisma.purchaseOrder.create({
      data: {
        userId: adminUser.id,
        organizationId,
        code: code('PO', poSeq),
        supplierId,
        supplierName,
        status: seed.status,
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
          })),
        },
      },
    });

    for (const l of priced) {
      const outstanding = l.qty - l.received;
      state[l.sku]!.incoming += outstanding; // forecast bucket for what's still on the way
      if (l.received > 0) {
        move(l.sku, l.received, StockLedgerReason.RESTOCK, StockLedgerSource.PURCHASE, {
          at: fullyReceived ? daysAgo(seed.daysBack - 2) : at,
          referenceId: po.id,
          note: `Terima ${po.code}`,
        });
      }
    }
  }
  console.log(`Purchasing: ${poSeq} POs (ordered / partial / received).`);

  // ── Stock opname (posted) ──────────────────────────────────────────────────────────────────
  const opnameAt = daysAgo(11);
  const opnameLines = [
    { sku: 'TOTE-NAT', counted: -2 },
    { sku: 'TOPI-KRM', counted: 1 },
  ];
  const opname = await prisma.stockOpname.create({
    data: {
      userId: staffUser.id,
      organizationId,
      code: code('OP', 1),
      status: StockOpnameStatus.COMPLETED,
      note: 'Cycle count rak depan',
      startedAt: opnameAt,
      completedAt: opnameAt,
      items: {
        create: opnameLines.map((l) => {
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
  for (const l of opnameLines) {
    if (l.counted !== 0) {
      move(l.sku, l.counted, StockLedgerReason.RECONCILE, StockLedgerSource.MANUAL, {
        at: opnameAt,
        referenceId: opname.id,
        note: `Opname ${opname.code}`,
      });
    }
  }
  console.log('Opname: 1 posted session.');

  // ── Recordings (packing videos; some match shipped/completed orders) ───────────────────────
  const recordingResis = ['JNE-DEMO-1001', 'JNT-DEMO-1003', 'WALK-IN-DEMO-9001'];
  for (let i = 0; i < recordingResis.length; i += 1) {
    const resi = recordingResis[i]!;
    await prisma.recording.create({
      data: {
        userId: staffUser.id,
        organizationId,
        noResi: resi,
        generatedFilename: `demo-pack-${i + 1}.webm`,
        storageProvider: 'cloudflare-r2',
        storageBucket: 'falka-recordings',
        storageKey: `${organizationId}/demo-pack-${i + 1}.webm`,
        publicUrl: `https://example.r2.dev/${organizationId}/demo-pack-${i + 1}.webm`,
        mimeType: 'video/webm',
        fileSizeBytes: BigInt(2_400_000 + i * 500_000),
        durationSeconds: 75 + i * 20,
        status: RecordingStatus.COMPLETED,
        startedAt: daysAgo(7 - i),
        stoppedAt: daysAgo(7 - i),
        uploadedAt: daysAgo(7 - i),
      },
    });
  }
  console.log(`Recordings: ${recordingResis.length} packing videos.`);

  // ── Notifications (history feed across categories) ─────────────────────────────────────────
  const notifSeeds = [
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
      title: 'PO00003 diterima penuh',
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
  ];
  for (let i = 0; i < notifSeeds.length; i += 1) {
    const n = notifSeeds[i]!;
    const notif = await prisma.notification.create({
      data: {
        organizationId,
        actorUserId: owner.id,
        type: n.type,
        category: n.category,
        severity: n.severity,
        title: n.title,
        body: n.body,
        href: n.href,
        dedupeKey: `demo-notif-${i + 1}`,
        createdAt: daysAgo(n.days),
      },
    });
    if (n.read) {
      await prisma.notificationRead.create({
        data: { notificationId: notif.id, userId: owner.id, readAt: daysAgo(n.days) },
      });
    }
  }
  console.log(`Notifications: ${notifSeeds.length} (mixed read/unread).`);

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
  ledger.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
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
        metadata: { code: 'S00008' } as Prisma.InputJsonValue,
        createdAt: daysAgo(1),
      },
      {
        userId: adminUser.id,
        organizationId,
        action: 'purchase.received',
        resource: 'purchase_order',
        metadata: { code: 'PO00003' } as Prisma.InputJsonValue,
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
        action: 'supplier.created',
        resource: 'supplier',
        metadata: { name: 'PT Tekstil Jaya' } as Prisma.InputJsonValue,
        createdAt: daysAgo(40),
      },
    ],
  });

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
