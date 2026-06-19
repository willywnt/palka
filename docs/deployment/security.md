# Security Recommendations

> **Legacy / stopgap.** This documents the current **Vercel + Neon** production setup. The committed direction is a **self-hosted single-host VPS** (Docker Compose: web + worker + Postgres + Redis, keeping Cloudflare R2) — see [vps-migration.md](./vps-migration.md) and [vps-setup.md](./vps-setup.md). On Vercel the worker + Socket.IO don't run, so marketplace sync / scheduled jobs / scanner are dormant in prod until cutover.

## Secrets management

| Secret                          | Storage                | Rotation               |
| ------------------------------- | ---------------------- | ---------------------- |
| `AUTH_SECRET`                   | Vercel env (Sensitive) | Quarterly              |
| `MARKETPLACE_ENCRYPTION_SECRET` | Vercel env (Sensitive) | On compromise only\*   |
| `R2_SECRET_ACCESS_KEY`          | Vercel env (Sensitive) | Quarterly              |
| `DATABASE_URL`                  | Vercel env (Sensitive) | On credential rotation |

\*Rotating marketplace encryption secret invalidates stored tokens — plan a re-connect flow.

Never commit `.env`, `.env.local`, or production credentials to git. `.gitignore` already excludes them.

## Database access

- Use Neon's IP allowlist if restricting admin access
- Application uses pooled connection with least-privilege DB user
- Separate databases per environment
- Enable Neon PITR on production

## Upload validation

Already implemented:

- Server-side MIME type validation (`video/webm`)
- Max file size (500 MB)
- Presigned URL expiry (5 minutes)
- Storage key ownership check (`{env}/{userId}/...`, env = `production`|`dev`; legacy `recordings/{userId}/...` still accepted)
- User storage quota enforcement

## API security

- Auth required on all `/api/v1/*` routes (except health)
- Ownership validation on recordings and marketplace connections
- Zod validation on all inputs
- No decrypted tokens in API responses

## HTTP headers

Vercel config sets on `/api/*`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

## CORS

R2 CORS is scoped to known origins only. Do not use `*` in production.

## Logging

- Structured Pino logs — no tokens, passwords, or encrypted secrets logged
- Audit log table for recording/marketplace actions
- Future: Sentry for error tracking with PII scrubbing

## Dependency hygiene

```bash
pnpm audit
```

Run periodically. Keep Next.js, Auth.js, and Prisma updated.

## Production hardening (future)

- Rate limiting on auth and upload endpoints
- WAF via Cloudflare
- CSP headers
- RBAC enforcement beyond route-level auth
