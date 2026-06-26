import { NextResponse } from 'next/server';

import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { expenseTemplateServerService } from '@/modules/finance/services/expense-template-server.service';
import { generateRecurringSchema } from '@/modules/finance/validators/expense-template';

export const POST = withApiRoute(
  async (request, { user, org }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = generateRecurringSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await expenseTemplateServerService.generateForMonth(
      org.id,
      user.id,
      parsed.data.month,
    );
    return apiSuccess(result);
  },
  { requireAuth: true, requirePermission: 'finance.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
