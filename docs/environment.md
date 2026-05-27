# Environment Variables

Olshop separates **public** (client) and **server-only** environment variables with Zod validation in `@olshop/config`.

## File layout

| File                      | Scope                       | Committed |
| ------------------------- | --------------------------- | --------- |
| `.env.example`            | Local dev template (root)   | Yes       |
| `.env.production.example` | Production reference        | Yes       |
| `.env`                    | Local server secrets (root) | No        |
| `apps/web/.env.example`   | Client template             | Yes       |
| `apps/web/.env.local`     | Next.js local overrides     | No        |

## Local development

1. Copy `.env.example` → `.env` at monorepo root
2. Copy `apps/web/.env.example` → `apps/web/.env.local`
3. **Sync server variables** into `apps/web/.env.local` — Next.js loads env from the app directory and root `.env` files, but `.env.local` overrides. Keep both in sync to avoid surprises.

## Variable reference

### Server-only (never expose to browser)

| Variable                        | Required | Description                                 |
| ------------------------------- | -------- | ------------------------------------------- |
| `DATABASE_URL`                  | Yes      | PostgreSQL connection string                |
| `AUTH_SECRET`                   | Yes      | Auth.js signing secret (min 32 chars)       |
| `AUTH_URL`                      | Prod     | Canonical app URL for Auth.js               |
| `NEXTAUTH_URL`                  | Prod     | Same as `AUTH_URL` for NextAuth compat      |
| `R2_ACCOUNT_ID`                 | Yes      | Cloudflare account ID                       |
| `R2_ACCESS_KEY_ID`              | Yes      | R2 API token access key                     |
| `R2_SECRET_ACCESS_KEY`          | Yes      | R2 API token secret                         |
| `R2_BUCKET_NAME`                | Yes      | R2 bucket name                              |
| `R2_PUBLIC_URL`                 | No       | Public bucket URL (r2.dev or custom domain) |
| `REDIS_URL`                     | No       | Redis URL for BullMQ workers                |
| `MARKETPLACE_ENCRYPTION_SECRET` | Yes      | AES-256-GCM key for marketplace tokens      |
| `LOG_LEVEL`                     | No       | `debug` \| `info` \| `warn` \| `error`      |
| `NODE_ENV`                      | Auto     | Set by runtime                              |

### Public (embedded in client bundle)

| Variable               | Required | Description    |
| ---------------------- | -------- | -------------- |
| `NEXT_PUBLIC_APP_URL`  | Yes      | Public app URL |
| `NEXT_PUBLIC_APP_NAME` | Yes      | Display name   |

### Optional marketplace OAuth (future)

`SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `TOKOPEDIA_CLIENT_ID`, `TOKOPEDIA_CLIENT_SECRET`

## Validation

Server env is validated at runtime via `getServerEnv()` in `@olshop/config/env.server`.

Client env is validated via `getClientEnv()` in `@olshop/config/env.client`.

## Generating secrets

```bash
# Auth.js + marketplace encryption
openssl rand -base64 32
```

## Environment matrix

| Environment | Database        | Redis              | Storage        | Hosting           |
| ----------- | --------------- | ------------------ | -------------- | ----------------- |
| Local       | Docker Postgres | Docker Redis       | Cloudflare R2  | `pnpm dev`        |
| Preview     | Neon (branch)   | Upstash (optional) | R2 dev bucket  | Vercel preview    |
| Production  | Neon (main)     | Upstash (optional) | R2 prod bucket | Vercel production |

Use **separate Neon databases** for development and production. Never point preview/production at your local Docker Postgres.

## Vercel configuration

Set all server variables in **Project Settings → Environment Variables**:

- **Production**: `main` branch deploys
- **Preview**: `develop` and `feature/*` branches
- **Development**: optional, for `vercel dev`

Mark secrets as **Sensitive**. Do not commit `.env` files.
