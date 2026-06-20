import 'server-only';

import { appLogger } from '@/lib/logger';
import { auditService } from '@/modules/audit/services/audit.service';

import { catalogServerService } from './catalog-server.service';
import { CatalogError } from '../errors/catalog-errors';
import type {
  ProductImportContextData,
  ProductImportReport,
  ProductImportRowResult,
  ProductImportSummary,
} from '../types';
import { MAX_IMPORT_ROWS } from '../utils/product-csv';
import { parseCsv, tableToRawRows } from '../utils/parse-products-csv';
import { planProductImport } from '../utils/product-import-plan';

function summarize(rows: ProductImportRowResult[]): ProductImportSummary {
  return {
    create: rows.filter((row) => row.status === 'create').length,
    update: rows.filter((row) => row.status === 'update').length,
    skip: rows.filter((row) => row.status === 'skip').length,
    error: rows.filter((row) => row.status === 'error').length,
    total: rows.length,
  };
}

/**
 * Bulk product CSV import. Parses + validates rows into a plan (create-vs-update
 * by SKU), then either returns a dry-run preview (`commit=false`, no writes) or
 * executes the plan through catalogServerService — createProduct / addVariants for
 * new variants (stock seeded via initialStock through the inventory service) and
 * updateVariantDetails for existing SKUs. Each create-group / update runs on its
 * own so one bad row never aborts the batch; failures flip that line to `error`.
 */
class ProductImportService {
  async import(
    organizationId: string,
    actorUserId: string,
    csv: string,
    commit: boolean,
  ): Promise<ProductImportReport> {
    const parsed = tableToRawRows(parseCsv(csv));
    if (parsed.error) throw CatalogError.validation(parsed.error);
    if (parsed.rows.length === 0) {
      throw CatalogError.validation('Tidak ada baris data di CSV.');
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      throw CatalogError.validation(
        `Terlalu banyak baris (${parsed.rows.length}). Maksimum ${MAX_IMPORT_ROWS} per impor.`,
      );
    }

    const skus = parsed.rows.map((row) => row.sku.trim()).filter(Boolean);
    const names = parsed.rows.map((row) => row.productName.trim()).filter(Boolean);
    const [existingVariantsBySku, existingProductIdsByName] = await Promise.all([
      catalogServerService.findVariantsBySkus(organizationId, skus),
      catalogServerService.findLiveProductIdsByName(organizationId, names),
    ]);

    const plan = planProductImport(parsed.rows, {
      existingVariantsBySku,
      existingProductIdsByName,
    });

    if (!commit) {
      return { committed: false, summary: plan.summary, rows: plan.rows };
    }

    const outcomeByLine = new Map<number, ProductImportRowResult>(
      plan.rows.map((row) => [row.line, row]),
    );
    const failGroup = (lines: number[], message: string) => {
      for (const line of lines) {
        const previous = outcomeByLine.get(line);
        if (previous) outcomeByLine.set(line, { ...previous, status: 'error', message });
      }
    };

    for (const group of plan.createGroups) {
      try {
        if (group.targetProductId) {
          await catalogServerService.addVariants(
            organizationId,
            actorUserId,
            group.targetProductId,
            group.variants,
          );
        } else {
          await catalogServerService.createProduct(organizationId, actorUserId, {
            name: group.name,
            description: group.description,
            category: group.category,
            variants: group.variants,
          });
        }
      } catch (error) {
        failGroup(group.lines, error instanceof CatalogError ? error.message : 'Gagal menyimpan.');
      }
    }

    for (const op of plan.updates) {
      try {
        await catalogServerService.updateVariantDetails(organizationId, op.variantId, op.input);
      } catch (error) {
        failGroup([op.line], error instanceof CatalogError ? error.message : 'Gagal memperbarui.');
      }
    }

    const rows = plan.rows.map((row) => outcomeByLine.get(row.line) ?? row);
    const summary = summarize(rows);

    appLogger.info('catalog.import.committed', { organizationId, actorUserId, ...summary });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'catalog.import',
      resource: 'product',
      metadata: {
        created: summary.create,
        updated: summary.update,
        skipped: summary.skip,
        errors: summary.error,
        total: summary.total,
      },
    });

    return { committed: true, summary, rows };
  }

  /**
   * Existing-data lookup for the preview: which of the given SKUs map to a live
   * variant, and which product names already exist. The wizard uses these to plan
   * create-vs-update (and re-plan edits) instantly on the client.
   */
  async resolveContext(
    organizationId: string,
    skus: string[],
    names: string[],
  ): Promise<ProductImportContextData> {
    const [variants, products] = await Promise.all([
      catalogServerService.findVariantsBySkus(organizationId, skus),
      catalogServerService.findLiveProductIdsByName(organizationId, names),
    ]);

    return {
      variantsBySku: Object.fromEntries(variants),
      productIdsByName: Object.fromEntries(products),
    };
  }
}

export const productImportService = new ProductImportService();
