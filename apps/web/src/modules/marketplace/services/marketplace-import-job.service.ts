import 'server-only';

import { prisma } from '@palka/db';
import { enqueueImportMarketplaceListings } from '@palka/queue';
import type { MarketplaceImportJob } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { MarketplaceError } from '../errors/marketplace-errors';
import { marketplaceImportService } from './marketplace-import.service';
import type { MarketplaceImportJobDto } from '../types';

/** A PENDING/PROCESSING job whose row hasn't advanced in this long is presumed dead (worker crash /
 *  lost job) so it never wedges new imports. The engine bumps `updatedAt` every page. */
const STALE_IMPORT_MS = 10 * 60 * 1000;

function toDto(job: MarketplaceImportJob): MarketplaceImportJobDto {
  return {
    id: job.id,
    status: job.status,
    totalProducts: job.totalProducts,
    processedProducts: job.processedProducts,
    importedRows: job.importedRows,
    autoMappedCount: job.autoMappedCount,
    errorCount: job.errorCount,
    lastError: job.lastError,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    async: job.status === 'PENDING' || job.status === 'PROCESSING',
  };
}

/**
 * Orchestrates a marketplace catalog import. Lazada (large, real catalogs) runs as a DURABLE
 * background job — created here, enqueued, then progressed by the worker; the UI polls
 * {@link getLatestJob}. Non-Lazada (stub) providers stay SYNCHRONOUS on the request path (tiny
 * catalogs), returning an inline COMPLETED result. Both shapes are the same DTO so the client is
 * uniform: `async=true` → poll, `async=false` → done.
 */
export class MarketplaceImportJobService {
  async startImport(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
  ): Promise<MarketplaceImportJobDto> {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, organizationId, deletedAt: null },
      select: { id: true, provider: true, isActive: true },
    });
    if (!connection) throw MarketplaceError.notFound();
    if (!connection.isActive) {
      throw MarketplaceError.validation('Marketplace connection is not active.');
    }

    if (connection.provider !== 'LAZADA') {
      const result = await marketplaceImportService.importListings(
        organizationId,
        actorUserId,
        connectionId,
      );
      return {
        id: null,
        status: 'COMPLETED',
        totalProducts: result.imported,
        processedProducts: result.imported,
        importedRows: result.imported,
        autoMappedCount: result.autoMapped,
        errorCount: 0,
        lastError: null,
        startedAt: null,
        completedAt: new Date().toISOString(),
        async: false,
      };
    }

    // Reuse a live job so a re-click (or two tabs) attaches instead of double-importing.
    const active = await this.findActiveJob(organizationId, connectionId);
    if (active) return toDto(active);

    const job = await prisma.marketplaceImportJob.create({
      data: {
        organizationId,
        connectionId,
        provider: connection.provider,
        actorUserId,
        status: 'PENDING',
      },
    });

    try {
      await enqueueImportMarketplaceListings(job.id);
    } catch (error) {
      // Couldn't reach the queue — drop the orphan PENDING row so it doesn't block future imports.
      await prisma.marketplaceImportJob.delete({ where: { id: job.id } }).catch(() => undefined);
      throw error;
    }

    appLogger.info('marketplace.import.enqueued', {
      organizationId,
      connectionId,
      importJobId: job.id,
    });
    return toDto(job);
  }

  /** Latest import job for a connection (any status) — drives the polling + reconnect-on-refresh UI. */
  async getLatestJob(
    organizationId: string,
    connectionId: string,
  ): Promise<MarketplaceImportJobDto | null> {
    const job = await prisma.marketplaceImportJob.findFirst({
      where: { organizationId, connectionId },
      orderBy: { createdAt: 'desc' },
    });
    return job ? toDto(job) : null;
  }

  private async findActiveJob(
    organizationId: string,
    connectionId: string,
  ): Promise<MarketplaceImportJob | null> {
    const job = await prisma.marketplaceImportJob.findFirst({
      where: { organizationId, connectionId, status: { in: ['PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) return null;
    if (Date.now() - job.updatedAt.getTime() > STALE_IMPORT_MS) return null;
    return job;
  }
}

export const marketplaceImportJobService = new MarketplaceImportJobService();
