import { NotificationCategory } from '@prisma/client';
import { z } from 'zod';

/** Toggle one category on/off in the member's tray (IN_APP channel). */
export const updateNotificationPreferenceSchema = z.object({
  category: z.nativeEnum(NotificationCategory),
  enabled: z.boolean(),
});

export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;
