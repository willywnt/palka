import { NextResponse } from 'next/server';

import { authService } from '@/modules/auth/services/auth.service';
import { AuthError } from '@/modules/auth/errors/auth-errors';
import { apiError, apiSuccess, apiValidationError } from '@/lib/api-response';
import { changePasswordSchema } from '@/modules/auth/validators/change-password';
import { withApiRoute } from '@/lib/api/with-api-route';

export const POST = withApiRoute(
  async (request, { user }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    try {
      await authService.changePassword(
        user.id,
        parsed.data.currentPassword,
        parsed.data.newPassword,
      );
    } catch (error) {
      // AuthError extends Error (not DomainError, since it drives the next-auth flow),
      // so the central mapper would 500 it. Translate to a 400 with the real message.
      // Deliberately NOT 401 — the global session-expiry watcher treats any 401 as a
      // logout and would bounce the user to /login on a mere wrong-password entry.
      if (error instanceof AuthError) {
        return apiError({ code: 'INVALID_CURRENT_PASSWORD', message: error.message }, 400);
      }
      throw error;
    }
    return apiSuccess(null);
  },
  { requireAuth: true, rateLimit: 'password-change' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
