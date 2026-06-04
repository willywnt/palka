import { NextResponse } from 'next/server';

import { returnsServerService } from '@/modules/returns/services/returns-server.service';
import { createReturnSchema } from '@/modules/returns/validators/create-return';
import { listReturnsQuerySchema } from '@/modules/returns/validators/list-returns';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (request, { user }) => {
    const parsed = listReturnsQuerySchema.safeParse({
      status: new URL(request.url).searchParams.get('status') ?? undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const data = await returnsServerService.listReturns(user.id, parsed.data);
    return apiSuccess(data);
  },
  { requireAuth: true },
);

export const POST = withApiRoute(
  async (request, { user }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createReturnSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const data = await returnsServerService.createReturn(user.id, parsed.data.orderId, {
      reason: parsed.data.reason,
    });
    return apiSuccess(data);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
