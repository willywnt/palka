import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { authConfig } from '@/auth.config';
import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/correlation-edge';

const { auth } = NextAuth(authConfig);

export default auth((request: NextRequest) => {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
});

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/recordings/:path*',
    '/mobile/:path*',
    '/marketplace/:path*',
    '/settings/:path*',
    '/login',
    '/register',
    // Exclude Socket.IO engine path (handled by custom server in dev:web / start)
    '/api/((?!socket).*)',
  ],
};
