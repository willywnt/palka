import 'server-only';

import { prisma } from '@olshop/db';
import { generateId, hashString } from '@olshop/utils/crypto';
import { RecordingStatus } from '@prisma/client';
import type { RecordingShareLink } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { storageService } from '@/modules/storage/services/storage.service';

import { RecordingError } from '../errors/recording-errors';
import type { PublicShareView, ShareLinkItem } from '../types';
import { resolveShareLinkStatus } from '../utils/share-link';

const TOKEN_BYTES = 24;
const HOUR_MS = 60 * 60 * 1000;

function mapShareLink(link: RecordingShareLink): ShareLinkItem {
  return {
    id: link.id,
    status: resolveShareLinkStatus(link, new Date()),
    expiresAt: link.expiresAt.toISOString(),
    revokedAt: link.revokedAt?.toISOString() ?? null,
    viewCount: link.viewCount,
    lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  };
}

/**
 * Share links let a buyer / marketplace dispute team view a packing video without
 * an account. The raw token lives only in the URL (and the one creation response);
 * the DB stores its hash. Each public view re-mints a short-lived presigned URL,
 * so the recordings bucket stays private.
 */
export class RecordingShareService {
  async createShareLink(
    userId: string,
    recordingId: string,
    expiresInHours: number,
  ): Promise<{ token: string; link: ShareLinkItem }> {
    const recording = await prisma.recording.findFirst({
      where: { id: recordingId, userId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!recording) throw RecordingError.validation('Recording not found.');
    if (recording.status !== RecordingStatus.COMPLETED) {
      throw RecordingError.validation('Only a completed recording can be shared.');
    }

    const token = generateId(TOKEN_BYTES);
    const tokenHash = hashString(token);
    const expiresAt = new Date(Date.now() + expiresInHours * HOUR_MS);

    const created = await prisma.recordingShareLink.create({
      data: { userId, recordingId, tokenHash, expiresAt },
    });

    appLogger.info('recording.share.created', {
      userId,
      recordingId,
      shareLinkId: created.id,
      expiresAt: expiresAt.toISOString(),
    });

    return { token, link: mapShareLink(created) };
  }

  async listShareLinks(userId: string, recordingId: string): Promise<ShareLinkItem[]> {
    const links = await prisma.recordingShareLink.findMany({
      where: { userId, recordingId },
      orderBy: { createdAt: 'desc' },
    });

    return links.map(mapShareLink);
  }

  async revokeShareLink(userId: string, shareLinkId: string): Promise<ShareLinkItem> {
    const link = await prisma.recordingShareLink.findFirst({
      where: { id: shareLinkId, userId },
    });
    if (!link) throw RecordingError.validation('Share link not found.');
    if (link.revokedAt) return mapShareLink(link);

    const updated = await prisma.recordingShareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });

    appLogger.info('recording.share.revoked', { userId, shareLinkId });

    return mapShareLink(updated);
  }

  /** Public, unauthenticated resolution of a raw share token to a viewer payload. */
  async resolvePublicShareLink(rawToken: string): Promise<PublicShareView | null> {
    const link = await prisma.recordingShareLink.findUnique({
      where: { tokenHash: hashString(rawToken) },
      include: {
        recording: {
          select: {
            noResi: true,
            durationSeconds: true,
            mimeType: true,
            storageKey: true,
            status: true,
          },
        },
      },
    });

    if (!link || resolveShareLinkStatus(link, new Date()) !== 'active') return null;

    const { recording } = link;
    if (recording.status !== RecordingStatus.COMPLETED || !recording.storageKey) return null;

    const access = await storageService.generateAccessUrl({
      storageKey: recording.storageKey,
      mimeType: recording.mimeType,
      disposition: 'inline',
    });

    // Best-effort view tracking — never fail the view if this write hiccups.
    await prisma.recordingShareLink
      .update({
        where: { id: link.id },
        data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      })
      .catch(() => undefined);

    return {
      noResi: recording.noResi,
      durationSeconds: recording.durationSeconds,
      mimeType: recording.mimeType,
      playbackUrl: access.url,
      expiresAt: link.expiresAt.toISOString(),
    };
  }
}

export const recordingShareService = new RecordingShareService();
