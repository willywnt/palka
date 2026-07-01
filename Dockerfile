# syntax=docker/dockerfile:1
#
# Single image for both runtime services (web + worker) and the migrate one-shot.
#   - apps/web    → custom Next + Socket.IO server (`tsx server.ts`)
#   - apps/worker → BullMQ background jobs (`node dist/index.js`)
# docker-compose.coolify.yml runs all three from this image, overriding the command per service.
#
# LAYERING: deps are installed from MANIFESTS ONLY (before the source COPY), so a source edit does NOT
# invalidate the install step. The hoisted root `node_modules` (`.npmrc` node-linker=hoisted → flat tree)
# is therefore byte-stable across code-only commits and lands in its own layer the VPS reuses (unchanged
# digest ⇒ skipped on pull); only the small apps layer (source + .next + dist) re-pulls per deploy. This
# fixes the old single `COPY /app /app` ~2.5GB-every-deploy layer that timed out Coolify's deploy.

FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    HUSKY=0
# Prisma's query engine needs openssl at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ---- Build: install deps (manifests-first) then build the whole monorepo ----
FROM base AS build
# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time — pass as build args.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME=Palka
ARG NEXT_PUBLIC_ENABLE_MOBILE_SCANNER=true
# Client-side Sentry DSN (browser bundle). Empty default = client Sentry stays off until set.
ARG NEXT_PUBLIC_SENTRY_DSN=
# Placeholder keeps any build-time Prisma client instantiation happy; `next build`
# never opens a real connection. The runtime DATABASE_URL comes from env at run time.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_ENABLE_MOBILE_SCANNER=$NEXT_PUBLIC_ENABLE_MOBILE_SCANNER \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    DATABASE_URL=$DATABASE_URL
# Build-time-ONLY placeholders so the production env schema passes during `next build`
# (it runs as NODE_ENV=production and the validated schema rejects missing required vars).
# These live in the BUILD stage only — they do NOT carry into the runtime image (a separate
# stage), so the real secrets come from the platform (Coolify) at run time.
ENV AUTH_SECRET=build-placeholder-auth-secret-padding-0000000000 \
    MARKETPLACE_ENCRYPTION_SECRET=build-placeholder-encryption-secret-pad \
    REDIS_URL=redis://localhost:6379 \
    R2_ACCOUNT_ID=build \
    R2_ACCESS_KEY_ID=build \
    R2_SECRET_ACCESS_KEY=build \
    R2_RECORDINGS_BUCKET_NAME=build-recordings \
    R2_PUBLIC_URL=https://r2-recordings.build.example.com \
    R2_PRODUCTS_BUCKET_NAME=build-products \
    R2_PRODUCTS_PUBLIC_URL=https://r2-products.build.example.com

# 1. MANIFESTS FIRST → install. This step is invalidated ONLY by a dependency/lockfile change (NOT by a
#    source edit), so its node_modules output is byte-stable + cache-reused across code-only commits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/health/package.json ./packages/health/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/marketplace-providers/package.json ./packages/marketplace-providers/package.json
COPY packages/metrics/package.json ./packages/metrics/package.json
COPY packages/queue/package.json ./packages/queue/package.json
COPY packages/rate-limit/package.json ./packages/rate-limit/package.json
COPY packages/redis/package.json ./packages/redis/package.json
COPY packages/storage/package.json ./packages/storage/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/utils/package.json ./packages/utils/package.json
# @palka/db's postinstall runs `prisma generate` — the schema must be present at install time.
COPY packages/db/prisma ./packages/db/prisma
# The root `prepare` lifecycle runs `node scripts/prepare.mjs` during install (it no-ops with HUSKY=0).
COPY scripts ./scripts
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# 2. FULL SOURCE → build. node_modules is .dockerignore'd, so this never overwrites the install above.
COPY . .
RUN pnpm build

# ---- Runtime (layer-split: stable node_modules + volatile app code) ----
FROM base AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# STABLE bulk: the hoisted root node_modules. Its content is fixed by the lockfile and the install step
# is cache-hit on code-only commits, so this layer's digest is unchanged ⇒ the VPS skips re-pulling it.
COPY --from=build /app/node_modules ./node_modules
# VOLATILE small: source + .next + dist + per-package node_modules + root manifests (re-pulled per deploy).
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc /app/turbo.json ./
EXPOSE 3000
# Default: web custom server (Next + Socket.IO). Compose overrides it for the worker.
CMD ["pnpm", "--filter", "@palka/web", "start"]
