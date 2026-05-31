import 'server-only';

import type { InventoryEvent, Prisma, Product, ProductVariant } from '@prisma/client';
import {
  buildPaginatedResult,
  getPaginationParams,
  notDeleted,
  prisma,
  type PaginatedResult,
} from '@olshop/db';

import type { ListProductsQuery, ListVariantsQuery } from '../validators/queries';

type ProductWithAggregates = Product & {
  _count: { variants: number };
  variants: Array<{ inventory: { availableStock: number } | null }>;
};

type VariantRow = ProductVariant & {
  product: Pick<Product, 'id' | 'name' | 'slug' | 'brand'>;
  inventory: {
    availableStock: number;
    reservedStock: number;
    damagedStock: number;
    incomingStock: number;
    lastAdjustedAt: Date | null;
    updatedAt: Date;
  } | null;
};

function buildProductSearchWhere(userId: string, search?: string): Prisma.ProductWhereInput {
  const base: Prisma.ProductWhereInput = { userId, ...notDeleted };

  if (!search?.trim()) return base;

  const term = search.trim();

  return {
    ...base,
    OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { brand: { contains: term, mode: 'insensitive' } },
      { slug: { contains: term, mode: 'insensitive' } },
      {
        variants: {
          some: {
            ...notDeleted,
            OR: [
              { sku: { contains: term, mode: 'insensitive' } },
              { barcode: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      },
    ],
  };
}

function buildVariantSearchWhere(
  userId: string,
  query: ListVariantsQuery,
): Prisma.ProductVariantWhereInput {
  const where: Prisma.ProductVariantWhereInput = {
    userId,
    ...notDeleted,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.active === 'ACTIVE' ? { isActive: true } : {}),
    ...(query.active === 'INACTIVE' ? { isActive: false } : {}),
    ...(query.brand ? { product: { brand: { equals: query.brand, mode: 'insensitive' } } } : {}),
  };

  if (query.search?.trim()) {
    const term = query.search.trim();
    where.OR = [
      { sku: { equals: term, mode: 'insensitive' } },
      { barcode: { equals: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
      { barcode: { contains: term, mode: 'insensitive' } },
      { name: { contains: term, mode: 'insensitive' } },
      { product: { name: { contains: term, mode: 'insensitive' } } },
    ];
  }

  if (query.stockStatus === 'OUT_OF_STOCK') {
    where.inventory = { availableStock: 0 };
  }

  if (query.stockStatus === 'LOW_STOCK') {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { inventory: { availableStock: { gt: 0 } } },
    ];
  }

  if (query.stockStatus === 'HEALTHY') {
    where.inventory = { availableStock: { gt: 0 } };
  }

  return where;
}

function filterVariantsByStockHealth(
  variants: VariantRow[],
  stockStatus: ListVariantsQuery['stockStatus'],
): VariantRow[] {
  if (stockStatus === 'ALL' || stockStatus === 'OUT_OF_STOCK') return variants;

  return variants.filter((variant) => {
    const available = variant.inventory?.availableStock ?? 0;
    const threshold = variant.lowStockThreshold;

    if (stockStatus === 'LOW_STOCK') {
      return available > 0 && available <= threshold;
    }

    if (stockStatus === 'HEALTHY') {
      return available > threshold;
    }

    return true;
  });
}

export class InventoryQueryRepository {
  async getOverviewStats(userId: string) {
    const [productCount, variantCount, variants, recentMutationCount] = await Promise.all([
      prisma.product.count({ where: { userId, ...notDeleted } }),
      prisma.productVariant.count({ where: { userId, ...notDeleted } }),
      prisma.productVariant.findMany({
        where: { userId, ...notDeleted },
        select: {
          lowStockThreshold: true,
          inventory: { select: { availableStock: true } },
        },
      }),
      prisma.inventoryEvent.count({
        where: {
          userId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalAvailableUnits = 0;

    for (const variant of variants) {
      const available = variant.inventory?.availableStock ?? 0;
      totalAvailableUnits += available;

      if (available <= 0) {
        outOfStockCount += 1;
      } else if (available <= variant.lowStockThreshold) {
        lowStockCount += 1;
      }
    }

    const healthyCount = variantCount - lowStockCount - outOfStockCount;

    return {
      productCount,
      variantCount,
      lowStockCount,
      outOfStockCount,
      healthyCount,
      totalAvailableUnits,
      mutationsLast24h: recentMutationCount,
    };
  }

  async findProductsPaginated(
    userId: string,
    query: ListProductsQuery,
  ): Promise<PaginatedResult<ProductWithAggregates>> {
    const { skip, take, page, pageSize } = getPaginationParams(query);
    const where = buildProductSearchWhere(userId, query.search);

    if (query.brand) {
      where.brand = { equals: query.brand, mode: 'insensitive' };
    }

    if (query.active === 'ACTIVE') where.isActive = true;
    if (query.active === 'INACTIVE') where.isActive = false;

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sortBy === 'name' ? { name: query.sortOrder } : { createdAt: query.sortOrder };

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          _count: { select: { variants: { where: notDeleted } } },
          variants: {
            where: notDeleted,
            select: { inventory: { select: { availableStock: true } } },
          },
        },
      }),
    ]);

    let items = products;

    if (query.sortBy === 'totalStock' || query.sortBy === 'variantCount') {
      items = [...products].sort((a, b) => {
        const aVal =
          query.sortBy === 'variantCount'
            ? a._count.variants
            : a.variants.reduce((sum, v) => sum + (v.inventory?.availableStock ?? 0), 0);
        const bVal =
          query.sortBy === 'variantCount'
            ? b._count.variants
            : b.variants.reduce((sum, v) => sum + (v.inventory?.availableStock ?? 0), 0);
        return query.sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async findVariantsPaginated(
    userId: string,
    query: ListVariantsQuery,
  ): Promise<PaginatedResult<VariantRow>> {
    const { page, pageSize } = getPaginationParams(query);
    const where = buildVariantSearchWhere(userId, query);

    const needsClientStockFilter =
      query.stockStatus === 'LOW_STOCK' || query.stockStatus === 'HEALTHY';

    if (needsClientStockFilter) {
      const allMatching = await prisma.productVariant.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, slug: true, brand: true } },
          inventory: {
            select: {
              availableStock: true,
              reservedStock: true,
              damagedStock: true,
              incomingStock: true,
              lastAdjustedAt: true,
              updatedAt: true,
            },
          },
        },
      });

      const filtered = filterVariantsByStockHealth(allMatching, query.stockStatus);
      const sorted = this.sortVariants(filtered, query);
      const skip = (page - 1) * pageSize;
      const items = sorted.slice(skip, skip + pageSize);

      return buildPaginatedResult(items, filtered.length, page, pageSize);
    }

    const { skip, take } = getPaginationParams(query);
    const orderBy = this.buildVariantOrderBy(query);

    const [total, items] = await Promise.all([
      prisma.productVariant.count({ where }),
      prisma.productVariant.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          product: { select: { id: true, name: true, slug: true, brand: true } },
          inventory: {
            select: {
              availableStock: true,
              reservedStock: true,
              damagedStock: true,
              incomingStock: true,
              lastAdjustedAt: true,
              updatedAt: true,
            },
          },
        },
      }),
    ]);

    return buildPaginatedResult(items, total, page, pageSize);
  }

  async findVariantDetail(userId: string, variantId: string) {
    return prisma.productVariant.findFirst({
      where: { id: variantId, userId, ...notDeleted },
      include: {
        product: true,
        inventory: true,
        marketplaceMappings: {
          select: {
            id: true,
            mappingStatus: true,
            syncEnabled: true,
            marketplaceProduct: { select: { externalSku: true } },
          },
        },
      },
    });
  }

  async findRecentMutations(userId: string, limit: number) {
    return prisma.inventoryEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        variant: {
          select: { sku: true, name: true, product: { select: { name: true } } },
        },
      },
    });
  }

  async listBrands(userId: string): Promise<string[]> {
    const rows = await prisma.product.findMany({
      where: { userId, ...notDeleted, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    });

    return rows.map((row) => row.brand).filter((brand): brand is string => Boolean(brand));
  }

  private sortVariants(variants: VariantRow[], query: ListVariantsQuery) {
    return [...variants].sort((a, b) => {
      let aVal: string | number | Date = 0;
      let bVal: string | number | Date = 0;

      switch (query.sortBy) {
        case 'sku':
          aVal = a.sku;
          bVal = b.sku;
          break;
        case 'availableStock':
          aVal = a.inventory?.availableStock ?? 0;
          bVal = b.inventory?.availableStock ?? 0;
          break;
        case 'updatedAt':
          aVal = a.inventory?.updatedAt ?? a.updatedAt;
          bVal = b.inventory?.updatedAt ?? b.updatedAt;
          break;
        default:
          aVal = a.createdAt;
          bVal = b.createdAt;
      }

      if (aVal < bVal) return query.sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return query.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  private buildVariantOrderBy(
    query: ListVariantsQuery,
  ): Prisma.ProductVariantOrderByWithRelationInput {
    switch (query.sortBy) {
      case 'sku':
        return { sku: query.sortOrder };
      case 'availableStock':
        return { inventory: { availableStock: query.sortOrder } };
      case 'updatedAt':
        return { updatedAt: query.sortOrder };
      default:
        return { createdAt: query.sortOrder };
    }
  }
}

export const inventoryQueryRepository = new InventoryQueryRepository();

export type RecentMutationRow = InventoryEvent & {
  variant: { sku: string; name: string; product: { name: string } };
};
