import { NextResponse } from 'next/server';

import { apiSuccess, apiValidationError } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';
import { expenseTemplateServerService } from '@/modules/finance/services/expense-template-server.service';
import { createExpenseTemplateSchema } from '@/modules/finance/validators/expense-template';

export const GET = withApiRoute(
  async (_request, { org }) => {
    const templates = await expenseTemplateServerService.listTemplates(org.id);
    return apiSuccess(templates);
  },
  { requireAuth: true, requirePermission: 'finance.view' },
);

export const POST = withApiRoute(
  async (request, { user, org }) => {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createExpenseTemplateSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const template = await expenseTemplateServerService.createTemplate(
      org.id,
      user.id,
      parsed.data,
    );
    return apiSuccess(template, 201);
  },
  { requireAuth: true, requirePermission: 'finance.manage' },
);

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
