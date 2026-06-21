import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { notificationPreferenceService } from '@/modules/notifications/services/notification-preference.service';
import { updateNotificationPreferenceSchema } from '@/modules/notifications/validators';

export const GET = withApiRoute(
  async (_request, { user, org }) => {
    const prefs = await notificationPreferenceService.getPreferences(org.id, user.id);
    return apiSuccess(prefs);
  },
  { requireAuth: true },
);

export const PATCH = withApiRoute(
  async (request, { user, org }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = updateNotificationPreferenceSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    await notificationPreferenceService.setPreference(
      org.id,
      user.id,
      parsed.data.category,
      parsed.data.enabled,
    );
    const prefs = await notificationPreferenceService.getPreferences(org.id, user.id);
    return apiSuccess(prefs);
  },
  { requireAuth: true, rateLimit: 'write' },
);
