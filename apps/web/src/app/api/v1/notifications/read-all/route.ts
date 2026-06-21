import { apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { hiddenNotificationCategories } from '@/modules/notifications/notification-visibility';
import { notificationPreferenceService } from '@/modules/notifications/services/notification-preference.service';
import { notificationServerService } from '@/modules/notifications/services/notification-server.service';

export const POST = withApiRoute(
  async (_request, { user, org }) => {
    // Mark read only what the member actually sees: RBAC-hidden ∪ self-muted categories.
    const hidden = [
      ...new Set([
        ...hiddenNotificationCategories(org.permissions),
        ...(await notificationPreferenceService.mutedCategories(org.id, user.id)),
      ]),
    ];

    const result = await notificationServerService.markAllRead(org.id, user.id, hidden);
    return apiSuccess(result);
  },
  { requireAuth: true },
);
