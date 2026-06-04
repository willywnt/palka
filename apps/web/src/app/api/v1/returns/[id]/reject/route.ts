import { NextResponse } from 'next/server';

import { returnsServerService } from '@/modules/returns/services/returns-server.service';
import { returnIdSchema } from '@/modules/returns/validators/return-id';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const POST = withApiRoute<RouteParams>(
  async (_request, { user, params }) => {
    const parsed = returnIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Return not found');

    const data = await returnsServerService.rejectReturn(user.id, parsed.data.id);
    return apiSuccess(data);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
