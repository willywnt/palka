# Production readiness checklist

> **Legacy / stopgap.** This documents the current **Vercel + Neon** production setup. The committed direction is a **self-hosted single-host VPS** (Docker Compose: web + worker + Postgres + Redis, keeping Cloudflare R2) — see [vps-migration.md](./vps-migration.md) and [vps-setup.md](./vps-setup.md). On Vercel the worker + Socket.IO don't run, so marketplace sync / scheduled jobs / scanner are dormant in prod until cutover.

Use this checklist before and after every production deployment.

## Deployment

- [ ] `DATABASE_URL` points to Neon production branch (not local Docker)
- [ ] `REDIS_URL` configured (Upstash or managed Redis)
- [ ] Worker service deployed separately from Vercel web app
- [ ] Worker health check configured on `/health` port `3001`
- [ ] Web health check configured on `/api/health` or `/api/v1/health`
- [ ] Prisma migrations apply on deploy (automatic via Vercel build, or run `pnpm db:migrate:deploy` manually)
- [ ] `APP_VERSION` or git SHA exposed in health response

## Environment

- [ ] `AUTH_SECRET` ≥ 32 chars, unique per environment
- [ ] `MARKETPLACE_ENCRYPTION_SECRET` ≥ 32 chars
- [ ] `AUTH_URL` / `NEXTAUTH_URL` match production domain (HTTPS)
- [ ] R2 bucket + credentials scoped to production bucket
- [ ] `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` configured
- [ ] `LOG_LEVEL=info` in production
- [ ] `LOG_PRETTY=false` in production

## Security

- [ ] HTTPS enforced (Vercel default + HSTS header)
- [ ] Secure session cookies enabled (`NODE_ENV=production`)
- [ ] Login rate limiting active (Redis required)
- [ ] Upload / recording rate limits active
- [ ] CSP headers do not block webcam / MediaRecorder / R2 uploads
- [ ] Admin ops route `/api/v1/admin/ops` restricted to `ADMIN` role
- [ ] No secrets in client bundle or logs

## Monitoring

- [ ] Sentry receiving frontend + API + worker errors
- [ ] Health endpoint returns dependency status (DB, Redis, R2, worker)
- [ ] Structured JSON logs shipped to log aggregator
- [ ] `x-request-id` present in API responses for support triage
- [ ] BullMQ failed job alerts configured (via logs or Sentry)
- [ ] Redis metrics counters monitored (`metrics:*` keys)

## Operational jobs

- [ ] Worker schedulers enabled (`WORKER_ENABLE_SCHEDULERS=true`)
- [ ] Storage consistency job scheduled (daily 05:00 UTC, dry-run by default)
- [ ] Recording cleanup / upload recovery jobs running
- [ ] Review admin ops report weekly for orphan storage / failed uploads

## Disaster recovery

- [ ] Neon PITR / backup retention verified
- [ ] R2 lifecycle + backup strategy documented
- [ ] Redis persistence expectations documented (see disaster-recovery.md)
- [ ] Runbook for worker restart + queue drain tested
