import 'server-only';

import { getRequestId, logger, resolveRequestId, REQUEST_ID_HEADER } from '@falka/logger/server';

import { handleApiError } from '@/lib/api-response';
import {
  assertRateLimitAllowed,
  enforceRateLimit,
  rateLimitHeaders,
  type RateLimitScope,
} from '@/lib/api/rate-limit';
import { getRequestIp, runWithRequestContext } from '@/lib/api/request-context';
import { AppError } from '@/lib/errors';
import { orgRoleAtLeast } from '@/lib/org-role';
import { resolveOrgContext, type OrgContext } from '@/modules/auth/services/org-context';
import { getCurrentUser } from '@/modules/auth/services/session';
import type { AuthUser } from '@/modules/auth/types';
import type { PermissionKey } from '@/modules/users/permissions/catalog';

type RouteParams = Record<string, string>;

/** Next.js passes the dynamic-segment params; the wrapper augments it. */
type RouteContext<TParams extends RouteParams = RouteParams> = {
  params: Promise<TParams>;
};

/**
 * Context handed to a wrapped handler: the Next route params plus the
 * authenticated user, their org context (id + role, re-validated against the
 * DB on every request — never trusted from the 30-day JWT), and the request id.
 */
export type ApiHandlerContext<TParams extends RouteParams = RouteParams> = RouteContext<TParams> & {
  user: AuthUser;
  org: OrgContext;
  requestId: string;
};

type ApiHandler<TParams extends RouteParams> = (
  request: Request,
  context: ApiHandlerContext<TParams>,
) => Response | Promise<Response>;

/**
 * Every wrapped route must gate on either an authenticated user or an admin, so
 * the handler can rely on a non-null `user`. `rateLimit` is optional.
 * `minOrgRole` additionally requires that role (or higher) in the user's org.
 */
export type ApiRouteOptions = {
  rateLimit?: RateLimitScope;
  minOrgRole?: 'ADMIN' | 'OWNER';
  /**
   * Require a configurable permission key. OWNER always passes; ADMIN/STAFF are
   * checked against the org's permission matrix. Use this (not minOrgRole) for
   * actions the owner can delegate; reserve minOrgRole: 'OWNER' for the few
   * owner-only routes (team role-change/remove, the matrix editor itself).
   */
  requirePermission?: PermissionKey;
} & ({ requireAuth: true; requireAdmin?: never } | { requireAdmin: true; requireAuth?: never });

/**
 * Wraps a Route Handler with the cross-cutting concerns every API route shares:
 * request-id correlation context, auth/admin/org gating, optional rate limiting,
 * and centralized error mapping (handleApiError). Handlers stay pure orchestration.
 */
export function withApiRoute<TParams extends RouteParams = RouteParams>(
  handler: ApiHandler<TParams>,
  options: ApiRouteOptions,
) {
  return async (request: Request, context: RouteContext<TParams>): Promise<Response> => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const ip = getRequestIp(request);

    try {
      return await runWithRequestContext(request, undefined, async () => {
        const user = await getCurrentUser();

        if (options.requireAuth && !user) {
          return handleApiError(AppError.unauthorized(), requestId);
        }

        if (options.requireAdmin && user?.role !== 'ADMIN') {
          return handleApiError(AppError.forbidden('Admin access required'), requestId);
        }

        // Membership is re-resolved per request: a removed member 401s on the
        // very next call (the fetch client then routes them back to /login).
        const org = user ? await resolveOrgContext(user.id) : null;

        if (!org) {
          return handleApiError(
            AppError.unauthorized('Akses organisasi kamu sudah tidak aktif.'),
            requestId,
          );
        }

        if (options.minOrgRole && !orgRoleAtLeast(org.role, options.minOrgRole)) {
          return handleApiError(
            AppError.forbidden('Aksi ini butuh peran yang lebih tinggi di organisasimu.'),
            requestId,
          );
        }

        if (options.requirePermission && !org.permissions.has(options.requirePermission)) {
          return handleApiError(
            AppError.forbidden('Peranmu tidak diizinkan melakukan aksi ini di organisasi ini.'),
            requestId,
          );
        }

        const handlerContext: ApiHandlerContext<TParams> = {
          ...context,
          user: user as AuthUser,
          org,
          requestId,
        };

        const rateLimitResult = options.rateLimit
          ? await enforceRateLimit(options.rateLimit, { ip, userId: user?.id })
          : null;

        if (rateLimitResult) {
          assertRateLimitAllowed(rateLimitResult);
        }

        const response = await handler(request, handlerContext);

        if (rateLimitResult) {
          for (const [key, value] of Object.entries(rateLimitHeaders(rateLimitResult))) {
            response.headers.set(key, value);
          }
        }

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
