import { NextResponse } from 'next/server';

import { ordersServerService } from '@/modules/orders/services/orders-server.service';
import { recordingServerService } from '@/modules/recordings/services/recording-server.service';
import { saveRecordingMetadataSchema } from '@/modules/recordings/validators/create-recording';
import { listRecordingsQuerySchema } from '@/modules/recordings/validators/list-recordings';
import { isUserStorageKey } from '@/modules/storage/utils/storage-key';
import { apiError, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { appLogger } from '@/lib/logger';

export const GET = withApiRoute(
  async (request, { user }) => {
    const { searchParams } = new URL(request.url);
    const parsed = listRecordingsQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
    });

    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await recordingServerService.listRecordings(user.id, parsed.data);
    return apiSuccess(result.items, 200, result.meta);
  },
  { requireAuth: true },
);

export const POST = withApiRoute(
  async (request, { user }) => {
    const body: unknown = await request.json();
    const parsed = saveRecordingMetadataSchema.safeParse(body);

    if (!parsed.success) return apiValidationError(parsed.error);

    if (!isUserStorageKey(parsed.data.storageKey, user.id)) {
      return apiError(
        { code: 'VALIDATION_ERROR', message: 'Invalid storage key for this user.' },
        400,
      );
    }

    const saved = await recordingServerService.completeRecording(user.id, parsed.data);

    appLogger.info('recording.metadata.saved', {
      userId: user.id,
      recordingId: saved.id,
      storageKey: saved.storageKey,
      fileSizeBytes: saved.fileSizeBytes,
    });

    // A completed packing video fulfills the matching order(s) (best-effort —
    // never fail the recording save if there's no order or the update errors).
    try {
      await ordersServerService.markFulfilledByResi(user.id, saved.noResi);
    } catch (error) {
      appLogger.warn('recording.fulfill.failed', {
        userId: user.id,
        recordingId: saved.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return apiSuccess(saved, 201);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
