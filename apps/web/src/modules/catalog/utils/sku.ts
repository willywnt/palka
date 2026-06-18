import 'server-only';

import { prisma } from '@falka/db';

/** The subset of `skus` currently owned by a live variant or a bundle (shared scan namespace). */
export async function takenSkus(organizationId: string, skus: string[]): Promise<Set<string>> {
  if (skus.length === 0) return new Set();
  const [variants, bundles] = await Promise.all([
    prisma.productVariant.findMany({
      where: { organizationId, sku: { in: skus }, deletedAt: null },
      select: { sku: true },
    }),
    prisma.bundle.findMany({
      where: { organizationId, sku: { in: skus }, deletedAt: null },
      select: { sku: true },
    }),
  ]);
  return new Set([...variants, ...bundles].map((row) => row.sku));
}
