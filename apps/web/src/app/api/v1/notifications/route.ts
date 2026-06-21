import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { hiddenNotificationCategories } from '@/modules/notifications/notification-visibility';
import { notificationPreferenceService } from '@/modules/notifications/services/notification-preference.service';
import { notificationServerService } from '@/modules/notifications/services/notification-server.service';
import { listNotificationsQuerySchema } from '@/modules/notifications/validators';

export const GET = withApiRoute(
  async (request, { user, org }) => {
    const params = new URL(request.url).searchParams;
    const parsed = listNotificationsQuerySchema.safeParse({
      page: params.get('page') ?? undefined,
      pageSize: params.get('pageSize') ?? undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    // RBAC-hidden categories (permission gate) ∪ the member's own muted categories.
    const hidden = [
      ...new Set([
        ...hiddenNotificationCategories(org.permissions),
        ...(await notificationPreferenceService.mutedCategories(org.id, user.id)),
      ]),
    ];

    const result = await notificationServerService.list(org.id, user.id, parsed.data, hidden);
    return apiSuccess(result.items, 200, { ...result.meta, unreadCount: result.unreadCount });
  },
  { requireAuth: true },
);
