import type { Server, Socket } from 'socket.io';
import { createLogger } from '@olshop/logger/server';

import { resolveAuthToken } from './resolve-auth-token';
import { verifyScannerSocketToken } from './socket-auth-token';

import { pairingRoomId, SCANNER_HEARTBEAT_STALE_MS } from '../src/modules/scanner-pairing/config';
import { PairingError } from '../src/modules/scanner-pairing/errors/pairing-errors';
import { pairingRepository } from '../src/modules/scanner-pairing/repositories/pairing.repository';
import { pairingService } from '../src/modules/scanner-pairing/services/pairing.service';
import { type toPairingSessionSummary } from '../src/modules/scanner-pairing/utils/pairing-mapper';
import {
  joinPairingSocketSchema,
  reportStationStateSchema,
  submitBarcodeSchema,
} from '../src/modules/scanner-pairing/validators/pairing';
import {
  CLIENT_SOCKET_EVENTS,
  SERVER_SOCKET_EVENTS,
  type BarcodeAckPayload,
  type BarcodeScannedServerPayload,
  type PairingErrorPayload,
  type PairingSessionEventPayload,
  type SocketAckResponse,
} from '../src/modules/scanner-pairing/socket/events';

const socketLogger = createLogger({ component: 'pairing-socket' });

type AuthenticatedSocket = Socket & { data: { userId?: string } };

function toErrorPayload(error: unknown): PairingErrorPayload {
  if (error instanceof PairingError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: 'UNKNOWN', message: error.message };
  }

  return { code: 'UNKNOWN', message: 'Unexpected socket error' };
}

function sessionPayload(
  session: ReturnType<typeof toPairingSessionSummary>,
): PairingSessionEventPayload {
  return {
    sessionId: session.id,
    status: session.status,
    expiresAt: session.expiresAt,
    deviceInfo: session.deviceInfo,
  };
}

export function registerPairingSocketHandlers(io: Server): void {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      // Cross-origin socket host (production): the browser authenticates with a
      // short-lived token in the handshake instead of the session cookie, which is
      // not sent cross-origin. Same-origin dev keeps using the cookie.
      const handshakeToken = socket.handshake.auth?.token;
      const userId =
        typeof handshakeToken === 'string'
          ? (await verifyScannerSocketToken(handshakeToken))?.id
          : (await resolveAuthToken({ headers: socket.request.headers }))?.id;

      if (!userId || typeof userId !== 'string') {
        socketLogger.warn('pairing.socket_auth_failed', {
          via: typeof handshakeToken === 'string' ? 'handshake' : 'cookie',
          hasCookie: Boolean(socket.request.headers.cookie),
        });
        return next(new Error('Unauthorized'));
      }

      socket.data.userId = userId;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    let joinedPairingId: string | null = null;
    let joinedRole: 'desktop' | 'mobile' | null = null;

    const emitToRoom = (pairingId: string, event: string, payload: unknown) => {
      io.to(pairingRoomId(pairingId)).emit(event, payload);
    };

    socket.on(
      CLIENT_SOCKET_EVENTS.JOIN_PAIRING,
      async (rawPayload: unknown, ack?: (response: SocketAckResponse) => void) => {
        try {
          const parsed = joinPairingSocketSchema.safeParse(rawPayload);
          if (!parsed.success) {
            throw PairingError.validation('Invalid join payload');
          }

          const session = await pairingService.assertSocketJoin(
            userId,
            parsed.data.pairingId,
            parsed.data.role,
          );

          if (joinedPairingId) {
            await socket.leave(pairingRoomId(joinedPairingId));
          }

          joinedPairingId = parsed.data.pairingId;
          joinedRole = parsed.data.role;
          await socket.join(pairingRoomId(joinedPairingId));

          socket.emit(SERVER_SOCKET_EVENTS.SESSION_STATE, sessionPayload(session));

          if (parsed.data.role === 'mobile' && session.status === 'CONNECTED') {
            emitToRoom(
              joinedPairingId,
              SERVER_SOCKET_EVENTS.PAIRING_CONNECTED,
              sessionPayload(session),
            );
          }

          ack?.({ ok: true, data: session });
        } catch (error) {
          const payload = toErrorPayload(error);
          socket.emit(SERVER_SOCKET_EVENTS.PAIRING_ERROR, payload);
          ack?.({ ok: false, error: payload });
        }
      },
    );

    socket.on(
      CLIENT_SOCKET_EVENTS.SCANNER_HEARTBEAT,
      async (rawPayload: { pairingId?: string }, ack?: (response: SocketAckResponse) => void) => {
        try {
          const pairingId = rawPayload?.pairingId ?? joinedPairingId;
          if (!pairingId) throw PairingError.notFound();

          // Heartbeat keeps lastSeenAt fresh for stale detection; no client
          // subscribes to a server-side heartbeat echo, so none is emitted.
          await pairingService.recordHeartbeat(userId, pairingId);
          ack?.({ ok: true });
        } catch (error) {
          const payload = toErrorPayload(error);
          ack?.({ ok: false, error: payload });
        }
      },
    );

    socket.on(
      CLIENT_SOCKET_EVENTS.BARCODE_SCANNED,
      async (
        rawPayload: unknown,
        ack?: (response: SocketAckResponse<BarcodeAckPayload>) => void,
      ) => {
        try {
          const parsed = submitBarcodeSchema.safeParse(rawPayload);
          if (!parsed.success) {
            throw PairingError.validation(parsed.error.errors[0]?.message ?? 'Invalid barcode');
          }

          if (joinedRole !== 'mobile') {
            throw PairingError.forbidden();
          }

          const { barcode, session } = await pairingService.submitBarcode(
            userId,
            parsed.data.pairingId,
            parsed.data.barcode,
          );

          const scannedPayload: BarcodeScannedServerPayload = {
            barcode,
            scannedAt: new Date().toISOString(),
          };

          emitToRoom(parsed.data.pairingId, SERVER_SOCKET_EVENTS.BARCODE_SCANNED, scannedPayload);
          emitToRoom(parsed.data.pairingId, SERVER_SOCKET_EVENTS.RECORDING_TRIGGERED, {
            barcode,
            pairingSessionId: parsed.data.pairingId,
          });

          const ackPayload: BarcodeAckPayload = { barcode, success: true };
          socket.emit(SERVER_SOCKET_EVENTS.BARCODE_ACK, ackPayload);
          ack?.({ ok: true, data: ackPayload });

          socketLogger.info('pairing.auto_recording_triggered', {
            userId,
            pairingSessionId: parsed.data.pairingId,
            barcode,
            sessionStatus: session.status,
          });
        } catch (error) {
          const payload = toErrorPayload(error);
          socket.emit(SERVER_SOCKET_EVENTS.PAIRING_ERROR, payload);
          ack?.({ ok: false, error: payload });
        }
      },
    );

    socket.on(
      CLIENT_SOCKET_EVENTS.REPORT_STATION_STATE,
      async (rawPayload: unknown, ack?: (response: SocketAckResponse) => void) => {
        try {
          const parsed = reportStationStateSchema.safeParse(rawPayload);
          if (!parsed.success) {
            throw PairingError.validation('Invalid station state payload');
          }

          if (joinedRole !== 'desktop') {
            throw PairingError.forbidden();
          }

          if (joinedPairingId !== parsed.data.pairingId) {
            throw PairingError.forbidden();
          }

          emitToRoom(parsed.data.pairingId, SERVER_SOCKET_EVENTS.STATION_RECORDING_STATE, {
            phase: parsed.data.phase,
            barcode: parsed.data.barcode,
            updatedAt: new Date().toISOString(),
          });

          ack?.({ ok: true });
        } catch (error) {
          const payload = toErrorPayload(error);
          ack?.({ ok: false, error: payload });
        }
      },
    );

    socket.on(
      CLIENT_SOCKET_EVENTS.DISCONNECT_PAIRING,
      async (rawPayload: { pairingId?: string }) => {
        const pairingId = rawPayload?.pairingId ?? joinedPairingId;
        if (!pairingId) return;

        try {
          const session = await pairingService.disconnect(userId, pairingId);
          emitToRoom(pairingId, SERVER_SOCKET_EVENTS.PAIRING_DISCONNECTED, sessionPayload(session));
        } catch (error) {
          socketLogger.warn('pairing.disconnect_failed', {
            userId,
            pairingSessionId: pairingId,
            error: error instanceof Error ? error.message : 'unknown',
          });
        }
      },
    );

    socket.on(CLIENT_SOCKET_EVENTS.LEAVE_PAIRING, async () => {
      if (joinedPairingId) {
        await socket.leave(pairingRoomId(joinedPairingId));
        joinedPairingId = null;
        joinedRole = null;
      }
    });

    socket.on('disconnect', () => {
      if (!joinedPairingId || joinedRole !== 'mobile') return;

      // Do not mark the DB session disconnected here — brief drops / reconnects are
      // normal on mobile. Stale detection uses SCANNER_HEARTBEAT_STALE_MS instead.
      socketLogger.debug('pairing.mobile_socket_transport_closed', {
        userId,
        pairingSessionId: joinedPairingId,
      });
    });
  });

  setInterval(() => {
    void pairingService.invalidateExpiredSessions();
  }, 60_000);

  setInterval(() => {
    for (const room of io.sockets.adapter.rooms.keys()) {
      if (!room.startsWith('pairing:')) continue;
      const pairingId = room.replace('pairing:', '');
      void pairingService.markScannerStale(pairingId).then(async () => {
        const session = await pairingRepository.findById(pairingId);
        if (session?.status === 'DISCONNECTED' || session?.status === 'EXPIRED') {
          io.to(pairingRoomId(pairingId)).emit(SERVER_SOCKET_EVENTS.PAIRING_DISCONNECTED, {
            sessionId: pairingId,
            status: session.status,
            expiresAt: session.expiresAt.toISOString(),
          });
        }
      });
    }
  }, SCANNER_HEARTBEAT_STALE_MS);
}
