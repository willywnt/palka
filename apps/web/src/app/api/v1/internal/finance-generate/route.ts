import { NextResponse } from 'next/server';

import { guardInternalRequest } from '@/lib/api/internal-request';
import { appLogger } from '@/lib/logger';
import { financeAutogenService } from '@/modules/finance/services/finance-autogen.service';

/**
 * Internal, secret-gated trigger for the monthly finance auto-generation. Called by the custom
 * server's timer (server.ts) on a loopback request — runs INSIDE Next so the finance module graph
 * resolves (the bootstrap can't import the server-only services directly). NOT a user endpoint: it
 * carries no session and writes for EVERY org, so it is gated by the internal-request guard (per-IP
 * rate limit + INTERNAL_API_SECRET bearer, falling back to AUTH_SECRET). The work is idempotent, so
 * a manual re-trigger is safe.
 */
export async function POST(request: Request) {
  const blocked = await guardInternalRequest(request);
  if (blocked) return blocked;

  try {
    const result = await financeAutogenService.runMonthlyForAllOrgs(new Date());
    return NextResponse.json({ data: result });
  } catch (error) {
    appLogger.warn('finance.autogen.failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
