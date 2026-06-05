import { NextResponse } from 'next/server';

import { pairingService } from '@/modules/scanner-pairing/services/pairing.service';
import { createPairingSchema } from '@/modules/scanner-pairing/validators/pairing';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const POST = withApiRoute(
  async (request, { user }) => {
    // Body is optional — a bodyless POST defaults to a recordings pairing.
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createPairingSchema.safeParse(body ?? {});
    if (!parsed.success) return apiValidationError(parsed.error);

    const created = await pairingService.createSession(user.id, parsed.data.purpose);
    return apiSuccess(created, 201);
  },
  { requireAuth: true },
);

export const GET = withApiRoute(
  async (_request, { user }) => {
    const active = await pairingService.getActiveSession(user.id);
    return apiSuccess(active);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
