import { NextResponse } from 'next/server';

import { teamService } from '@/modules/users/services/team.service';
import { createInviteSchema } from '@/modules/users/validators/team';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (_request, { org }) => {
    const invites = await teamService.listInvites(org.id);
    return apiSuccess(invites);
  },
  { requireAuth: true, minOrgRole: 'ADMIN' },
);

// ADMIN may create invites, but the service refuses an ADMIN-role invite unless
// the actor is OWNER (hybrid authority).
export const POST = withApiRoute(
  async (request, { org, user }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createInviteSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const invite = await teamService.createInvite(
      org.id,
      { userId: user.id, role: org.role },
      parsed.data.role,
    );
    return apiSuccess(invite, 201);
  },
  { requireAuth: true, minOrgRole: 'ADMIN' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
