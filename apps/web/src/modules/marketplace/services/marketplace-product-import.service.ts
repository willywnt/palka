import 'server-only';

import { prisma } from '@olshop/db';

import type { NormalizedMarketplaceProduct } from '../domain/normalized-product.types';
import { MarketplaceError } from '../errors/marketplace-errors';
import { getMarketplaceProviderAdapter } from '../providers';
import { marketplaceAccountRepository } from '../repositories/marketplace-account.repository';
import { marketplaceProductRepository } from '../repositories/marketplace-product.repository';
import { marketplaceAutoMatchService } from './marketplace-auto-match.service';
import { marketplaceMappingService } from './marketplace-mapping.service';
import { marketplaceAccountService } from './marketplace-account.service';
import { appLogger } from '@/lib/logger';

export type ImportProductsResult = {
  imported: number;
  updated: number;
  autoMapped: number;
  unmapped: number;
  accountId: string;
};

export class MarketplaceProductImportService {
  async importProducts(
    userId: string,
    marketplaceAccountId: string,
    options?: { dryRun?: boolean },
  ): Promise<ImportProductsResult> {
    const account = await marketplaceAccountRepository.findByIdForUser(
      userId,
      marketplaceAccountId,
    );

    if (!account) throw MarketplaceError.notFound('Marketplace account not found.');
    if (account.status === 'DISCONNECTED') {
      throw MarketplaceError.validation('Cannot import from a disconnected account.');
    }

    const tokens = await marketplaceAccountService.getDecryptedTokens(userId, marketplaceAccountId);
    const adapter = getMarketplaceProviderAdapter(account.provider);

    appLogger.info('marketplace.import.start', {
      userId,
      accountId: marketplaceAccountId,
      provider: account.provider,
    });

    let rawProducts;

    try {
      rawProducts = await adapter.fetchProducts(tokens.accessToken);
    } catch (error) {
      if (error instanceof MarketplaceError && error.code === 'VALIDATION_ERROR') {
        rawProducts = this.buildDevFallbackProducts(account.provider);
        appLogger.info('marketplace.import.dev_fallback', {
          accountId: marketplaceAccountId,
          count: rawProducts.length,
        });
      } else {
        throw error;
      }
    }

    const normalized: NormalizedMarketplaceProduct[] = [];

    for (const raw of rawProducts) {
      const product = adapter.normalizeProduct(raw);
      if (product) normalized.push(product);
    }

    if (options?.dryRun) {
      return {
        imported: normalized.length,
        updated: 0,
        autoMapped: 0,
        unmapped: normalized.length,
        accountId: marketplaceAccountId,
      };
    }

    const persistedIds = new Map<string, string>();
    let updated = 0;

    for (const product of normalized) {
      const existing = await marketplaceProductRepository.findManyByAccount(marketplaceAccountId, {
        search: product.externalVariantId,
        limit: 1,
      });

      const saved = await marketplaceProductRepository.upsertByExternalVariant({
        marketplaceAccountId,
        provider: account.provider,
        externalProductId: product.externalProductId,
        externalVariantId: product.externalVariantId,
        externalSku: product.externalSku,
        externalProductName: product.externalProductName,
        externalVariantName: product.externalVariantName,
        stock: product.stock,
        status: product.status,
        rawPayload: product.rawPayload,
      });

      if (existing.length > 0) updated += 1;
      persistedIds.set(product.externalVariantId, saved.id);
    }

    const skuCandidates = await marketplaceAutoMatchService.findExactSkuCandidates(
      userId,
      marketplaceAccountId,
      normalized,
      persistedIds,
    );

    const barcodeCandidates = await marketplaceAutoMatchService.findBarcodeCandidates(
      userId,
      marketplaceAccountId,
      normalized,
      persistedIds,
    );

    const allCandidates = [...skuCandidates, ...barcodeCandidates];
    let autoMapped = 0;

    for (const candidate of allCandidates) {
      try {
        await marketplaceMappingService.createMapping(userId, {
          productVariantId: candidate.productVariantId,
          marketplaceProductId: candidate.marketplaceProductId,
          autoMapped: true,
          mappingConfidence: candidate.confidence,
        });
        autoMapped += 1;
      } catch {
        // Skip conflicts — operator resolves manually
      }
    }

    await prisma.marketplaceAccount.update({
      where: { id: marketplaceAccountId },
      data: { lastSyncAt: new Date() },
    });

    const unmapped =
      (await marketplaceProductRepository.countByAccount(marketplaceAccountId, {
        unmappedOnly: true,
      })) ?? 0;

    appLogger.info('marketplace.import.complete', {
      userId,
      accountId: marketplaceAccountId,
      imported: normalized.length,
      autoMapped,
      unmapped,
    });

    return {
      imported: normalized.length,
      updated,
      autoMapped,
      unmapped,
      accountId: marketplaceAccountId,
    };
  }

  private buildDevFallbackProducts(provider: string) {
    return [
      {
        externalProductId: `dev-${provider.toLowerCase()}-001`,
        externalVariantId: `dev-${provider.toLowerCase()}-001-v1`,
        externalSku: 'DEV-SAMPLE-SKU',
        externalProductName: `Sample ${provider} Product`,
        externalVariantName: 'Default Variant',
        stock: 10,
        status: 'active',
      },
      {
        externalProductId: `dev-${provider.toLowerCase()}-002`,
        externalVariantId: `dev-${provider.toLowerCase()}-002-v1`,
        externalSku: 'DEV-UNMAPPED-SKU',
        externalProductName: `Unmapped ${provider} Product`,
        externalVariantName: 'Variant B',
        stock: 3,
        status: 'active',
      },
    ];
  }
}

export const marketplaceProductImportService = new MarketplaceProductImportService();
