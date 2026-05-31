import 'server-only';

import { prisma } from '@olshop/db';

import { resolveMappingHealth } from '../domain/mapping-health';
import {
  toMarketplaceProductDetailDto,
  toMarketplaceProductListItemDto,
} from '../dto/product.mappers';
import {
  toMarketplaceMappingDetailDto,
  toMarketplaceMappingListItemDto,
} from '../dto/mapping.mappers';
import type {
  MarketplaceMappingDetailDto,
  MarketplaceMappingListItemDto,
} from '../dto/mapping.dto';
import type {
  MarketplaceProductDetailDto,
  MarketplaceProductListItemDto,
} from '../dto/product.dto';
import { MarketplaceError } from '../errors/marketplace-errors';
import { marketplaceProductMappingRepository } from '../repositories/marketplace-product-mapping.repository';
import { marketplaceProductRepository } from '../repositories/marketplace-product.repository';
import { appLogger } from '@/lib/logger';

export class MarketplaceMappingService {
  async listMappings(
    userId: string,
    options?: {
      marketplaceAccountId?: string;
      mappingStatus?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{ items: MarketplaceMappingListItemDto[]; total: number }> {
    const limit = options?.pageSize ?? 50;
    const offset = ((options?.page ?? 1) - 1) * limit;

    const items = await marketplaceProductMappingRepository.findManyByUser(userId, {
      marketplaceAccountId: options?.marketplaceAccountId,
      mappingStatus: options?.mappingStatus as never,
      search: options?.search,
      limit,
      offset,
    });

    return {
      items: items.map(toMarketplaceMappingListItemDto),
      total: items.length,
    };
  }

  async listUnmappedProducts(
    userId: string,
    marketplaceAccountId: string,
    options?: { search?: string; page?: number; pageSize?: number },
  ): Promise<{ items: MarketplaceProductListItemDto[]; total: number }> {
    const account = await this.getOwnedAccount(userId, marketplaceAccountId);
    const limit = options?.pageSize ?? 50;
    const offset = ((options?.page ?? 1) - 1) * limit;

    const [items, total] = await Promise.all([
      marketplaceProductRepository.findManyByAccount(account.id, {
        search: options?.search,
        unmappedOnly: true,
        limit,
        offset,
      }),
      marketplaceProductRepository.countByAccount(account.id, { unmappedOnly: true }),
    ]);

    return {
      items: items.map(toMarketplaceProductListItemDto),
      total,
    };
  }

  async listProducts(
    userId: string,
    marketplaceAccountId: string,
    options?: { search?: string; unmappedOnly?: boolean; page?: number; pageSize?: number },
  ): Promise<{ items: MarketplaceProductListItemDto[]; total: number }> {
    const account = await this.getOwnedAccount(userId, marketplaceAccountId);
    const limit = options?.pageSize ?? 50;
    const offset = ((options?.page ?? 1) - 1) * limit;

    const [items, total] = await Promise.all([
      marketplaceProductRepository.findManyByAccount(account.id, {
        search: options?.search,
        unmappedOnly: options?.unmappedOnly,
        limit,
        offset,
      }),
      marketplaceProductRepository.countByAccount(account.id, {
        unmappedOnly: options?.unmappedOnly,
      }),
    ]);

    return { items: items.map(toMarketplaceProductListItemDto), total };
  }

  async getProductDetail(
    userId: string,
    marketplaceAccountId: string,
    productId: string,
  ): Promise<MarketplaceProductDetailDto> {
    await this.getOwnedAccount(userId, marketplaceAccountId);

    const product = await marketplaceProductRepository.findByIdForAccount(
      marketplaceAccountId,
      productId,
    );

    if (!product) throw MarketplaceError.notFound('Marketplace product not found.');

    return toMarketplaceProductDetailDto(product);
  }

  async createMapping(
    userId: string,
    input: {
      productVariantId: string;
      marketplaceProductId: string;
      syncEnabled?: boolean;
      autoMapped?: boolean;
      mappingConfidence?: number;
    },
  ): Promise<MarketplaceMappingDetailDto> {
    const product = await prisma.marketplaceProduct.findFirst({
      where: {
        id: input.marketplaceProductId,
        deletedAt: null,
        marketplaceAccount: { userId, ...{ deletedAt: null } },
      },
      include: { marketplaceAccount: true },
    });

    if (!product) throw MarketplaceError.notFound('Marketplace product not found.');

    const variant = await prisma.productVariant.findFirst({
      where: { id: input.productVariantId, userId, deletedAt: null },
    });

    if (!variant) throw MarketplaceError.notFound('Internal variant not found.');

    await this.validateNoConflicts(
      product.marketplaceAccountId,
      input.productVariantId,
      input.marketplaceProductId,
    );

    const mapping = await marketplaceProductMappingRepository.create({
      productVariantId: input.productVariantId,
      marketplaceProductId: input.marketplaceProductId,
      marketplaceAccountId: product.marketplaceAccountId,
      provider: product.provider,
      mappingStatus: 'MAPPED',
      syncEnabled: input.syncEnabled ?? true,
      autoMapped: input.autoMapped ?? false,
      mappingConfidence: input.mappingConfidence ?? null,
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'marketplace.mapping.created',
        resource: 'marketplace_product_mapping',
        metadata: {
          mappingId: mapping.id,
          productVariantId: variant.id,
          internalSku: variant.sku,
          marketplaceProductId: product.id,
          externalSku: product.externalSku,
        },
      },
    });

    appLogger.info('marketplace.mapping.created', {
      userId,
      mappingId: mapping.id,
      autoMapped: input.autoMapped ?? false,
    });

    const full = await marketplaceProductMappingRepository.findByIdForUser(userId, mapping.id);
    if (!full) throw MarketplaceError.notFound();

    return toMarketplaceMappingDetailDto(full);
  }

  async removeMapping(userId: string, mappingId: string): Promise<void> {
    const mapping = await marketplaceProductMappingRepository.findByIdForUser(userId, mappingId);
    if (!mapping) throw MarketplaceError.notFound('Mapping not found.');

    await marketplaceProductMappingRepository.softDelete(mappingId);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'marketplace.mapping.removed',
        resource: 'marketplace_product_mapping',
        metadata: { mappingId },
      },
    });

    appLogger.info('marketplace.mapping.removed', { userId, mappingId });
  }

  async validateMapping(userId: string, mappingId: string): Promise<MarketplaceMappingDetailDto> {
    const mapping = await marketplaceProductMappingRepository.findByIdForUser(userId, mappingId);
    if (!mapping) throw MarketplaceError.notFound('Mapping not found.');

    const productDeleted = Boolean(mapping.marketplaceProduct.deletedAt);
    const variantDeleted = Boolean(mapping.productVariant.deletedAt);

    let mappingStatus = mapping.mappingStatus;

    if (productDeleted || variantDeleted) {
      mappingStatus = 'BROKEN';
    } else if (mapping.mappingStatus === 'CONFLICT') {
      mappingStatus = 'CONFLICT';
    } else {
      mappingStatus = 'MAPPED';
    }

    if (mappingStatus !== mapping.mappingStatus) {
      await marketplaceProductMappingRepository.updateStatus(mappingId, mappingStatus);
    }

    const health = resolveMappingHealth({
      mappingStatus,
      syncEnabled: mapping.syncEnabled,
      productDeleted,
      variantDeleted,
    });

    appLogger.info('marketplace.mapping.validated', {
      userId,
      mappingId,
      syncReady: health.syncReady,
      issues: health.issues,
    });

    const updated = await marketplaceProductMappingRepository.findByIdForUser(userId, mappingId);
    if (!updated) throw MarketplaceError.notFound();

    return toMarketplaceMappingDetailDto(updated);
  }

  private async validateNoConflicts(
    marketplaceAccountId: string,
    productVariantId: string,
    marketplaceProductId: string,
  ) {
    const variantConflict = await marketplaceProductMappingRepository.findByVariantAndAccount(
      productVariantId,
      marketplaceAccountId,
    );

    if (variantConflict) {
      throw MarketplaceError.mappingConflict('This internal SKU is already mapped for this store.');
    }

    const productConflict = await marketplaceProductMappingRepository.findByProductAndAccount(
      marketplaceProductId,
      marketplaceAccountId,
    );

    if (productConflict) {
      throw MarketplaceError.mappingConflict(
        'This marketplace SKU is already mapped to another internal variant.',
      );
    }
  }

  private async getOwnedAccount(userId: string, accountId: string) {
    const account = await prisma.marketplaceAccount.findFirst({
      where: { id: accountId, userId, deletedAt: null },
    });

    if (!account) throw MarketplaceError.notFound('Marketplace account not found.');

    return account;
  }
}

export const marketplaceMappingService = new MarketplaceMappingService();
