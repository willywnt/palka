import 'server-only';

import { getRequestId, logger, resolveRequestId, REQUEST_ID_HEADER } from '@olshop/logger/server';
import { NextResponse } from 'next/server';

import { handleApiError } from '@/lib/api-response';
import {
  assertRateLimitAllowed,
  enforceRateLimit,
  rateLimitHeaders,
  type RateLimitScope,
} from '@/lib/api/rate-limit';
import { getRequestIp, runWithRequestContext } from '@/lib/api/request-context';
import { AppError } from '@/lib/errors';
import { getCurrentUser } from '@/modules/auth/services/session';

type RouteContext = {
  params: Promise<Record<string, string>>;
};

type ApiHandler = (request: Request, context: RouteContext) => Response | Promise<Response>;

export type ApiRouteOptions = {
  rateLimit?: RateLimitScope;
  requireAuth?: boolean;
  requireAdmin?: boolean;
};

export function withApiRoute(handler: ApiHandler, options: ApiRouteOptions = {}) {
  return async (request: Request, context: RouteContext) => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const ip = getRequestIp(request);

    try {
      return await runWithRequestContext(request, undefined, async () => {
        const user = options.requireAuth || options.requireAdmin ? await getCurrentUser() : null;

        if (options.requireAuth && !user) {
          return handleApiError(AppError.unauthorized(), requestId);
        }

        if (options.requireAdmin && user?.role !== 'ADMIN') {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
            { status: 403, headers: { [REQUEST_ID_HEADER]: requestId } },
          );
        }

        if (options.rateLimit) {
          const rateLimitResult = await enforceRateLimit(options.rateLimit, {
            ip,
            userId: user?.id,
          });
          assertRateLimitAllowed(rateLimitResult);

          const response = await handler(request, context);
          const headers = rateLimitHeaders(rateLimitResult);
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
          response.headers.set(REQUEST_ID_HEADER, getRequestId() ?? requestId);
          return response;
        }

        const response = await handler(request, context);
        response.headers.set(REQUEST_ID_HEADER, getRequestId() ?? requestId);
        return response;
      });
    } catch (error) {
      logger.warn('api.route.error', {
        requestId,
        path: new URL(request.url).pathname,
        method: request.method,
      });
      return handleApiError(error, requestId);
    }
  };
}
