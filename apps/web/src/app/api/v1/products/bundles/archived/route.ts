import { bundleServerService } from '@/modules/catalog/services/bundle-server.service';
import { apiSuccess } from '@/lib/api-response';
import { withApiRoute } from '@/lib/api/with-api-route';

export const GET = withApiRoute(
  async (_request, { org }) => {
    const bundles = await bundleServerService.listArchivedBundles(org.id);
    return apiSuccess(bundles);
  },
  { requireAuth: true },
);
