import { NextResponse } from 'next/server';

import { returnsServerService } from '@/modules/returns/services/returns-server.service';
import { processReturnSchema } from '@/modules/returns/validators/process-return';
import { returnIdSchema } from '@/modules/returns/validators/return-id';
import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const POST = withApiRoute<RouteParams>(
  async (request, { user, params }) => {
    const parsedParams = returnIdSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Return not found');

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = processReturnSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const data = await returnsServerService.processReturn(
      user.id,
      parsedParams.data.id,
      parsed.data,
    );
    return apiSuccess(data);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
