import 'server-only';

import { getServerEnv } from '@palka/config/env.server';
import { prisma } from '@palka/db';
import { enqueueImportMarketplaceListings } from '@palka/queue';
import { Prisma, type MarketplaceImportJob } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { MarketplaceError } from '../errors/marketplace-errors';
import { marketplaceImportService } from './marketplace-import.service';
import type { MarketplaceImportJobDto } from '../types';

/** A PENDING/PROCESSING job whose row hasn't advanced in this long is presumed dead (worker crash /
 *  lost job) so it never wedges new imports. The engine bumps `updatedAt` every page. Must exceed
 *  the worst-case BullMQ inter-attempt backoff (~640s at attempt 8) so a deeply-throttled-but-alive
 *  job isn't misjudged dead. The DB partial-unique index is the real guard against a true duplicate. */
const STALE_IMPORT_MS = 20 * 60 * 1000;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toDto(job: MarketplaceImportJob): MarketplaceImportJobDto {
  return {
    id: job.id,
    status: job.status,
    full: job.full,
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
 * Orchestrates a marketplace catalog import. Real adapters (Lazada + configured Shopee — large
 * catalogs) run as a DURABLE background job — created here, enqueued, then progressed by the worker;
 * the UI polls {@link getLatestJob}. Stub/unconfigured providers stay SYNCHRONOUS on the request path
 * (tiny catalogs), returning an inline COMPLETED result. Both shapes are the same DTO so the client
 * is uniform: `async=true` → poll, `async=false` → done.
 */
export class MarketplaceImportJobService {
  async startImport(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
    full = false,
  ): Promise<MarketplaceImportJobDto> {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, organizationId, deletedAt: null },
      select: { id: true, provider: true, isActive: true },
    });
    if (!connection) throw MarketplaceError.notFound();
    if (!connection.isActive) {
      throw MarketplaceError.validation('Marketplace connection is not active.');
    }

    // Real adapters run the import as a durable background job; stub/unconfigured providers import
    // inline (tiny catalogs). Shopee only goes async when its app creds are set — without them a
    // Shopee connection (e.g. a demo/stub) has no real client, so it stays on the inline stub path.
    const env = getServerEnv();
    const useBackgroundJob =
      connection.provider === 'LAZADA' ||
      (connection.provider === 'SHOPEE' &&
        Boolean(env.SHOPEE_PARTNER_ID && env.SHOPEE_PARTNER_KEY));

    if (!useBackgroundJob) {
      const result = await marketplaceImportService.importListings(
        organizationId,
        actorUserId,
        connectionId,
      );
      return {
        id: null,
        status: 'COMPLETED',
        full: true,
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
    if (active) return this.attachOrRefuse(active, full);

    let job: MarketplaceImportJob;
    try {
      job = await prisma.marketplaceImportJob.create({
        data: {
          organizationId,
          connectionId,
          provider: connection.provider,
          actorUserId,
          status: 'PENDING',
          full,
        },
      });
    } catch (error) {
      // A concurrent request won the partial-unique-index race (one active import per connection) —
      // attach to its job rather than double-importing.
      if (isUniqueViolation(error)) {
        const existing = await this.findActiveJob(organizationId, connectionId);
        if (existing) return this.attachOrRefuse(existing, full);
      }
      throw error;
    }

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

  /** Attach to a live job — but refuse (rather than silently downgrade) when the caller asked for a
   *  FULL re-pull and the running job is only incremental. Retry the full import once it finishes. */
  private attachOrRefuse(active: MarketplaceImportJob, full: boolean): MarketplaceImportJobDto {
    if (full && !active.full) {
      throw MarketplaceError.validation(
        'Impor sedang berjalan. Coba "Impor ulang semua" lagi setelah impor ini selesai.',
      );
    }
    return toDto(active);
  }
}

export const marketplaceImportJobService = new MarketplaceImportJobService();
