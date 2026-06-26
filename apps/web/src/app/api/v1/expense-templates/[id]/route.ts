import { NextResponse } from 'next/server';

import { apiNotFound, apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { expenseTemplateServerService } from '@/modules/finance/services/expense-template-server.service';
import {
  expenseTemplateIdSchema,
  updateExpenseTemplateSchema,
} from '@/modules/finance/validators/expense-template';

type RouteParams = { id: string };

export const PATCH = withApiRoute<RouteParams>(
  async (request, { user, org, params }) => {
    const parsedId = expenseTemplateIdSchema.safeParse(await params);
    if (!parsedId.success) return apiNotFound('Expense template not found');

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = updateExpenseTemplateSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const template = await expenseTemplateServerService.updateTemplate(
      org.id,
      user.id,
      parsedId.data.id,
      parsed.data,
    );
    return apiSuccess(template);
  },
  { requireAuth: true, requirePermission: 'finance.manage' },
);

export const DELETE = withApiRoute<RouteParams>(
  async (_request, { user, org, params }) => {
    const parsed = expenseTemplateIdSchema.safeParse(await params);
    if (!parsed.success) return apiNotFound('Expense template not found');

    const result = await expenseTemplateServerService.deleteTemplate(
      org.id,
      user.id,
      parsed.data.id,
    );
    return apiSuccess(result);
  },
  { requireAuth: true, requirePermission: 'finance.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
