import { NextResponse } from 'next/server';

import { teamService } from '@/modules/users/services/team.service';
import { apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (_request, { org, user }) => {
    const members = await teamService.listMembers(org.id, user.id);
    return apiSuccess(members);
  },
  { requireAuth: true, requirePermission: 'team.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
