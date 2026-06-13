import { NextResponse } from 'next/server';

import { orgService } from '@/modules/users/services/org.service';
import { updatePermissionsSchema } from '@/modules/users/validators/org';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

// Admins may VIEW the matrix (so the "Peran & akses" screen renders for them),
// but only the OWNER may edit it.
export const GET = withApiRoute(
  async (_request, { org }) => {
    const matrix = await orgService.getPermissionMatrix(org.id);
    return apiSuccess(matrix);
  },
  { requireAuth: true, minOrgRole: 'ADMIN' },
);

export const PATCH = withApiRoute(
  async (request, { org }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = updatePermissionsSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    await orgService.updatePermissions(org.id, parsed.data);
    return apiSuccess({ ok: true });
  },
  { requireAuth: true, minOrgRole: 'OWNER' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
