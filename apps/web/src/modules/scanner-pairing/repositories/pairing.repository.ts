import type {
  PairingPurpose,
  PairingSession,
  PairingSessionStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { prisma } from '@olshop/db';

export type PairingSessionUser = {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
};

export type CreatePairingSessionData = {
  id: string;
  userId: string;
  pairingCode: string;
  purpose: PairingPurpose;
  expiresAt: Date;
};

export class PairingRepository {
  async create(data: CreatePairingSessionData): Promise<PairingSession> {
    return prisma.pairingSession.create({ data });
  }

  async findById(id: string): Promise<PairingSession | null> {
    return prisma.pairingSession.findUnique({ where: { id } });
  }

  async findActiveByUserId(userId: string): Promise<PairingSession | null> {
    return prisma.pairingSession.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'CONNECTED'] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async expireSessionsForUser(userId: string, excludeId?: string): Promise<number> {
    const result = await prisma.pairingSession.updateMany({
      where: {
        userId,
        status: { in: ['PENDING', 'CONNECTED'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      data: {
        status: 'EXPIRED',
        updatedAt: new Date(),
      },
    });

    return result.count;
  }

  async expireStaleSessions(): Promise<number> {
    const result = await prisma.pairingSession.updateMany({
      where: {
        status: { in: ['PENDING', 'CONNECTED'] },
        expiresAt: { lte: new Date() },
      },
      data: {
        status: 'EXPIRED',
        updatedAt: new Date(),
      },
    });

    return result.count;
  }

  async markConnected(
    id: string,
    data: {
      connectedAt: Date;
      lastSeenAt: Date;
      expiresAt: Date;
      deviceInfo: Prisma.InputJsonValue;
    },
  ): Promise<PairingSession> {
    return prisma.pairingSession.update({
      where: { id },
      data: {
        status: 'CONNECTED',
        connectedAt: data.connectedAt,
        lastSeenAt: data.lastSeenAt,
        expiresAt: data.expiresAt,
        deviceInfo: data.deviceInfo,
      },
    });
  }

  async touchHeartbeat(id: string, expiresAt: Date): Promise<PairingSession> {
    return prisma.pairingSession.update({
      where: { id },
      data: {
        lastSeenAt: new Date(),
        expiresAt,
      },
    });
  }

  async recordScan(id: string, barcode: string): Promise<PairingSession> {
    return prisma.pairingSession.update({
      where: { id },
      data: {
        lastBarcode: barcode,
        lastScanAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  }

  async disconnect(
    id: string,
    status: PairingSessionStatus = 'DISCONNECTED',
  ): Promise<PairingSession> {
    return prisma.pairingSession.update({
      where: { id },
      data: { status },
    });
  }

  /** The session owner, for QR auto-sign-in (keeps Prisma access in the repository). */
  async findSessionUser(userId: string): Promise<PairingSessionUser | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, displayName: true },
    });
  }
}

export const pairingRepository = new PairingRepository();
