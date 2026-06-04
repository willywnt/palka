import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordingServerService } from '@/modules/recordings/services/recording-server.service';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

const byResiQuerySchema = z.object({
  noResi: z.string().trim().min(1).max(64),
});

export const GET = withApiRoute(
  async (request, { user }) => {
    const parsed = byResiQuerySchema.safeParse({
      noResi: new URL(request.url).searchParams.get('noResi') ?? '',
    });

    if (!parsed.success) return apiValidationError(parsed.error);

    const recordings = await recordingServerService.findByResi(user.id, parsed.data.noResi);
    return apiSuccess(recordings);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
