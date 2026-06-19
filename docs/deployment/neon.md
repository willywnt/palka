# Neon PostgreSQL

> **Legacy / stopgap.** This documents the current **Vercel + Neon** production setup. The committed direction is a **self-hosted single-host VPS** (Docker Compose: web + worker + Postgres + Redis, keeping Cloudflare R2) — see [vps-migration.md](./vps-migration.md) and [vps-setup.md](./vps-setup.md). On Vercel the worker + Socket.IO don't run, so marketplace sync / scheduled jobs / scanner are dormant in prod until cutover.

## Strategy

Use **separate databases** for each environment:

| Environment | Neon resource         | Connection                                            |
| ----------- | --------------------- | ----------------------------------------------------- |
| Local       | Docker Compose        | `postgresql://postgres:postgres@localhost:5432/falka` |
| Preview     | Neon branch or dev DB | Pooled URL in Vercel Preview env                      |
| Production  | Neon main project     | Pooled URL in Vercel Production env                   |

## Setup

1. Create a [Neon](https://neon.tech) project
2. Create database `falka` (or use default)
3. Copy the **pooled connection string** (recommended for Vercel serverless):

```
postgresql://USER:PASSWORD@ep-xxx-pooler.region.aws.neon.tech/falka?sslmode=require
```

4. Set `DATABASE_URL` in Vercel Production environment variables

## Preview / development database

Option A — **Neon branch per PR** (recommended for teams):

- Enable Neon-Vercel integration
- Each preview deploy gets an isolated branch

Option B — **Shared dev database**:

- Create a separate Neon project or database
- Set `DATABASE_URL` in Vercel Preview scope only

Never share production credentials with preview or local environments.

## Migration workflow

### Local development

```bash
# Create a new migration after schema changes
pnpm db:migrate:dev

# Commit packages/db/prisma/migrations/* to git
```

### Production / preview

Migrations run automatically at the start of each Vercel build (see `apps/web/vercel.json`). Ensure `DATABASE_URL` is set for **Production** and **Preview** scopes.

Manual apply (optional):

```bash
DATABASE_URL="your-neon-url" pnpm db:migrate:deploy
```

Set `SKIP_DB_MIGRATE=1` in Vercel to skip auto-migration for a single deploy (emergency only).

### Reset local only

```bash
pnpm infra:reset -- --yes
```

**Never** reset production with `migrate reset`.

## Connection pooling

Vercel serverless functions open many short-lived connections. Always use Neon's **pooled** connection string (`-pooler` hostname) for `DATABASE_URL`.

For long-running workers (future VPS/BullMQ), use the direct connection string.

## Prisma configuration

Schema: `packages/db/prisma/schema.prisma`

The Prisma client singleton lives in `@falka/db` and is shared across the monorepo.

## Backup

Enable Neon point-in-time recovery (PITR) on production projects. Schedule regular logical backups for compliance if required.

## Troubleshooting

**Too many connections**

- Switch to pooled connection string
- Reduce concurrent serverless function invocations

**Migration failed on deploy**

- Check migration history: `pnpm db:migrate:deploy` output
- Resolve failed migration manually in Neon SQL editor
- Never use `db push` to fix production
