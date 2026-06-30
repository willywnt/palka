import { NextResponse } from 'next/server';
import { z } from 'zod';

import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { shopeeOAuthService } from '@/modules/marketplace/services/shopee-oauth.service';

const connectCodeSchema = z.object({
  code: z.string().trim().min(1).max(256),
  shopId: z.string().trim().min(1).max(64),
});

/**
 * Manual Shopee connect from a code + shop_id captured OUT-OF-BAND — notably Shopee's sandbox
 * console "Authorize Test Partner" tool, which returns ?code&shop_id to the redirect WITHOUT our
 * `state` (so the public OAuth callback can't complete it). The org/actor come from the
 * authenticated caller instead of the encrypted state; the code still originates from Shopee's
 * consent flow, so this is the same trust model as the callback. Gated by marketplace.manage.
 */
export const POST = withApiRoute(
  async (request, { user, org }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = connectCodeSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await shopeeOAuthService.connectWithCode({
      organizationId: org.id,
      actorUserId: user.id,
      code: parsed.data.code,
      shopId: parsed.data.shopId,
    });
    return apiSuccess(result);
  },
  { requireAuth: true, rateLimit: 'write', requirePermission: 'marketplace.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
