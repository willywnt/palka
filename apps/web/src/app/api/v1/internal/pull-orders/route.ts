import { NextResponse } from 'next/server';

import { guardInternalRequest } from '@/lib/api/internal-request';
import { appLogger } from '@/lib/logger';
import { ordersServerService } from '@/modules/orders/services/orders-server.service';

/**
 * Internal, secret-gated trigger for the scheduled order pull. Called by the custom server's
 * timer (server.ts) on a loopback request — runs INSIDE Next so the order-ingest module graph
 * resolves normally (the server bootstrap can't import it directly). NOT a user endpoint: it
 * carries no session and pulls every org's active stores, so it is gated by the internal-request
 * guard (per-IP rate limit + INTERNAL_API_SECRET bearer, falling back to AUTH_SECRET).
 */
export async function POST(request: Request) {
  const blocked = guardInternalRequest(request);
  if (blocked) return blocked;

  try {
    const result = await ordersServerService.runScheduledPull();
    return NextResponse.json({ data: result });
  } catch (error) {
    appLogger.warn('orders.internal_pull.failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
