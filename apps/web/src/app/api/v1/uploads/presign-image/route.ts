import { NextResponse } from 'next/server';

import { uploadService } from '@/modules/storage/services/upload.service';
import { imagePresignSchema } from '@/modules/storage/validators/image-presign';
import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const POST = withApiRoute(
  async (request, { user }) => {
    const body: unknown = await request.json();
    const parsed = imagePresignSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await uploadService.createPresignedImageUpload(user.id, parsed.data);
    return apiSuccess(result);
  },
  { requireAuth: true },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
