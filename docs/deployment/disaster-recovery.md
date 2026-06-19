# Disaster recovery strategy

> **Legacy / stopgap.** This documents the current **Vercel + Neon** production setup. The committed direction is a **self-hosted single-host VPS** (Docker Compose: web + worker + Postgres + Redis, keeping Cloudflare R2) — see [vps-migration.md](./vps-migration.md) and [vps-setup.md](./vps-setup.md). On Vercel the worker + Socket.IO don't run, so marketplace sync / scheduled jobs / scanner are dormant in prod until cutover.

Falka is a modular monolith. Recovery focuses on PostgreSQL, R2 object storage, and Redis queue state.

## Recovery priorities

| Priority | Component         | Impact if lost                       | Recovery approach                      |
| -------- | ----------------- | ------------------------------------ | -------------------------------------- |
| P0       | PostgreSQL (Neon) | Users, recordings metadata, auth     | Restore from Neon PITR / backup        |
| P1       | Cloudflare R2     | Recording video files                | R2 versioning / bucket replication     |
| P2       | Redis (Upstash)   | In-flight jobs, rate limits, metrics | Rebuild queues; jobs are retryable     |
| P3       | Vercel web        | UI + API unavailable                 | Redeploy from git                      |
| P3       | Worker host       | Background jobs pause                | Restart worker; schedulers re-register |

## PostgreSQL (Neon)

**Recommendation:** Enable Neon point-in-time recovery on production.

- **RPO:** Minutes (Neon PITR window)
- **RTO:** 15–60 minutes depending on database size
- **Procedure:**
  1. Identify incident timestamp
  2. Create Neon branch / restore from PITR
  3. Update `DATABASE_URL` on Vercel + worker
  4. Run `pnpm db:migrate:deploy` to verify schema
  5. Smoke test auth + recordings list

Never point production at local Docker Postgres.

## Cloudflare R2

**Recommendation:**

- Enable object versioning or periodic bucket sync to secondary bucket/account
- Document bucket name per environment (`falka-recordings` vs `falka-recordings-prod`)
- Use lifecycle rules for incomplete multipart uploads

**Orphan handling:**

- Run storage consistency verification job (dry-run) before manual cleanup
- Use admin ops endpoint `/api/v1/admin/ops` to review mismatches
- Do **not** auto-delete orphan objects without operator review

## Redis

Redis holds BullMQ queues, rate-limit counters, and lightweight metrics.

**Persistence expectations:**

- Upstash: managed persistence; treat as recoverable but not authoritative
- Local Docker Redis: ephemeral; acceptable for development only

**Recovery:**

1. Restart Redis / Upstash instance
2. Restart worker (`pnpm --filter @falka/worker start`)
3. Schedulers re-register repeat jobs on boot
4. Failed jobs remain in BullMQ failed set if persistence enabled
5. Rate limits and metrics counters reset (acceptable)

## Worker process

Worker supports graceful shutdown on `SIGTERM` / `SIGINT`:

1. Stop accepting health traffic
2. Close BullMQ workers (finishes active jobs)
3. Close Redis + Prisma connections
4. Flush Sentry buffer

Set `WORKER_SHUTDOWN_TIMEOUT_MS=30000` on container platforms.

## Web application (Vercel)

- Redeploy from last known good git SHA
- Verify env vars in Vercel project settings
- Confirm `/api/health` returns `ok`

## Testing recovery

Quarterly drill:

1. Restore Neon branch to staging
2. Verify worker connects to staging Redis + DB
3. Confirm recording upload + playback against R2 staging bucket
4. Review Sentry + logs for errors during drill

## Future architecture notes

When adding marketplace OAuth, AI/OCR workers, or external processors:

- Store OAuth tokens encrypted (`MARKETPLACE_ENCRYPTION_SECRET`)
- Use separate BullMQ queues per domain
- Propagate `requestId` into all new job payloads
- Add health checks for each external dependency

See `FUTURE_QUEUE_CAPABILITIES` in `packages/queue/src/types/index.ts`.
