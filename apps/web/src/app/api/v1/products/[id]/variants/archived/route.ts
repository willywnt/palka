import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { productIdParamSchema } from '@/modules/catalog/validators';
import { apiNotFound, apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

type RouteParams = { id: string };

export const GET = withApiRoute<RouteParams>(
  async (_request, { user, params }) => {
    const parsedParams = productIdParamSchema.safeParse(await params);
    if (!parsedParams.success) return apiNotFound('Product not found');

    const variants = await catalogServerService.listArchivedVariants(user.id, parsedParams.data.id);
    return apiSuccess(variants);
  },
  { requireAuth: true },
);
