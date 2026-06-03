import { createScannerSocketToken } from '@/modules/scanner-pairing/services/socket-token.service';
import { apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

/**
 * Mints a short-lived handshake auth token so the browser can authenticate to the
 * (possibly cross-origin) Socket.IO host without relying on the session cookie. This
 * route is same-origin to the app, so the cookie IS sent and `user` is non-null.
 */
export const GET = withApiRoute(
  async (_request, { user }) => apiSuccess({ token: await createScannerSocketToken(user.id) }),
  { requireAuth: true },
);
