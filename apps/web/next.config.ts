import { join } from 'path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

loadEnvConfig(join(__dirname, '../..'));

const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: blob:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    '@falka/config',
    '@falka/types',
    '@falka/utils',
    '@falka/db',
    '@falka/logger',
    '@falka/logger/server',
    '@falka/health',
    '@falka/redis',
    '@falka/rate-limit',
    '@falka/metrics',
  ],
  typedRoutes: true,
  serverExternalPackages: ['pino', 'pino-pretty', '@sentry/nextjs', 'socket.io'],
  // lucide-react is a ~3900-module barrel imported across ~130 files; the icon-level
  // rewrite keeps dev route compiles (webpack) and client bundles lean. date-fns/recharts
  // are already in Next's built-in optimize list, so they don't need listing here.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Upload-Security', value: 'presigned-only' },
        ],
      },
    ];
  },
};

export default nextConfig;
