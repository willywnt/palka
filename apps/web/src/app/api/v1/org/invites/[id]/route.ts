import { NextResponse } from 'next/server';

import { teamService } from '@/modules/users/services/team.service';
import { apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const DELETE = withApiRoute<{ id: string }>(
  async (_request, { params, org, user }) => {
    const { id } = await params;
    await teamService.revokeInvite(org.id, user.id, id);
    return apiSuccess({ ok: true });
  },
  { requireAuth: true, requirePermission: 'team.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
