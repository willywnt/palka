# Deployment Guide

> **Legacy / stopgap.** This documents the current **Vercel + Neon** production setup. The committed direction is a **self-hosted single-host VPS** (Docker Compose: web + worker + Postgres + Redis, keeping Cloudflare R2) — see [vps-migration.md](./vps-migration.md) and [vps-setup.md](./vps-setup.md). On Vercel the worker + Socket.IO don't run, so marketplace sync / scheduled jobs / scanner are dormant in prod until cutover.

Production stack:

| Service        | Provider               |
| -------------- | ---------------------- |
| Hosting        | Vercel                 |
| Database       | Neon PostgreSQL        |
| Object storage | Cloudflare R2          |
| Auth           | Auth.js (Credentials)  |
| Redis (future) | Upstash or self-hosted |

## Quick checklist

- [ ] Neon production database created
- [ ] Vercel project linked (`apps/web` as root directory)
- [ ] All env vars set in Vercel (see `.env.production.example`)
- [ ] `DATABASE_URL` set in Vercel (migrations run automatically during build)
- [ ] R2 production bucket + CORS configured
- [ ] Custom domain + SSL on Vercel
- [ ] `AUTH_SECRET` generated with `openssl rand -base64 32`

## Git branch strategy

| Branch      | Deployment            | Database                |
| ----------- | --------------------- | ----------------------- |
| `main`      | Vercel **Production** | Neon production         |
| `develop`   | Vercel **Preview**    | Neon dev/preview branch |
| `feature/*` | Vercel **Preview**    | Neon dev/preview branch |

## Deployment flow

```
feature/* → PR → develop (preview) → PR → main (production)
```

### First production deploy

1. Create Neon project and copy pooled connection string
2. Import repo in Vercel → set **Root Directory** to `apps/web`
3. Configure environment variables (Production scope)
4. Deploy `main` branch (migrations apply automatically during the Vercel build)
5. Apply R2 production CORS (see [r2.md](./r2.md))
6. Verify `/api/v1/health`, login, recording upload

### Subsequent deploys

Vercel auto-deploys on push. Pending Prisma migrations are applied at the start of each build (`db:migrate:deploy` in `apps/web/vercel.json`). If a migration fails, the deploy is blocked.

To skip migrations for a one-off deploy (emergency only), set `SKIP_DB_MIGRATE=1` in Vercel env vars.

Manual migration (optional):

```bash
DATABASE_URL="postgresql://..." pnpm db:migrate:deploy
```

**Never use `prisma db push` in production.**

## Vercel settings

| Setting         | Value                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Root Directory  | `apps/web`                                                                                      |
| Framework       | Next.js                                                                                         |
| Install Command | `cd ../.. && pnpm install`                                                                      |
| Build Command   | `cd ../.. && pnpm --filter @falka/db db:migrate:deploy && pnpm turbo build --filter=@falka/web` |
| Node.js Version | 20.x                                                                                            |

These are configured in `apps/web/vercel.json`.

Install sets `HUSKY=0` and `--prod=false` so git hooks are skipped and **devDependencies** (TypeScript, ESLint, shared tsconfig) are installed for monorepo package builds.

### Include monorepo files

In Vercel project settings, ensure **Root Directory** is `apps/web` and **Include source files outside of the Root Directory** is enabled (default for Turborepo).

## Prisma in production

```bash
# Apply pending migrations (CI, local, or Neon SQL editor alternative)
pnpm db:migrate:deploy

# Generate client (runs automatically via @falka/db postinstall)
pnpm db:generate
```

Migration files live in `packages/db/prisma/migrations/`. Commit all migration SQL to git.

## Logging

Production logs use **Pino** (structured JSON). View in Vercel → Logs.

Set `LOG_LEVEL=info` in production, `debug` in preview if needed.

Future: pipe Pino output to Sentry, Datadog, or Axiom.

## Related guides

- [Neon PostgreSQL](./neon.md)
- [Cloudflare R2](./r2.md)
- [Auth.js production](./auth.md)
- [Security](./security.md)
- [VPS migration](./vps-migration.md)
