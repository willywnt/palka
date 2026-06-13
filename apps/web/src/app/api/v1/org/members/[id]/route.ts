import { NextResponse } from 'next/server';

import { teamService } from '@/modules/users/services/team.service';
import { updateMemberRoleSchema } from '@/modules/users/validators/team';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

// Role change + removal are OWNER-only (the hybrid authority model); the OWNER
// row itself is immutable, enforced in the service.
export const PATCH = withApiRoute<{ id: string }>(
  async (request, { params, org, user }) => {
    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = updateMemberRoleSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    await teamService.updateMemberRole(org.id, user.id, id, parsed.data.role);
    return apiSuccess({ ok: true });
  },
  { requireAuth: true, minOrgRole: 'OWNER' },
);

export const DELETE = withApiRoute<{ id: string }>(
  async (_request, { params, org, user }) => {
    const { id } = await params;
    await teamService.removeMember(org.id, user.id, id);
    return apiSuccess({ ok: true });
  },
  { requireAuth: true, minOrgRole: 'OWNER' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
