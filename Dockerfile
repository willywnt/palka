# syntax=docker/dockerfile:1
#
# Single image for both runtime services:
#   - apps/web    → custom Next + Socket.IO server (`tsx server.ts`)
#   - apps/worker → BullMQ background jobs (`node dist/index.js`)
# docker-compose.yml runs both from this image, overriding the command for the
# worker. Build once; compose tags it as `palka-app:latest`.
#
# NOTE: untested build scaffold — validate/tune at first deploy (native deps,
# image size, build-time env). See docs/deployment/vps-setup.md.

FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# Prisma's query engine needs openssl at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ---- Install deps + build the whole monorepo (turbo build) ----
FROM base AS build
# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time — pass as build args.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME=Palka
ARG NEXT_PUBLIC_ENABLE_MOBILE_SCANNER=true
# Placeholder keeps any build-time Prisma client instantiation happy; `next build`
# never opens a real connection. The runtime DATABASE_URL comes from env at run time.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_ENABLE_MOBILE_SCANNER=$NEXT_PUBLIC_ENABLE_MOBILE_SCANNER \
    DATABASE_URL=$DATABASE_URL
# Build-time-ONLY placeholders so the production env schema passes during `next build`
# (it runs as NODE_ENV=production and the validated schema rejects missing required vars).
# These live in the BUILD stage only — they do NOT carry into the runtime image (a separate
# stage), so the real secrets come from the platform (Coolify) at run time. Mirrors the CI
# `gates` job env in .github/workflows/ci.yml. NOT secrets — nothing connects out at build.
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
COPY . .
# postinstall runs `prisma generate`; pnpm store is cached across builds.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build

# ---- Runtime ----
FROM base AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build /app /app
EXPOSE 3000
# Default: web custom server (Next + Socket.IO). Compose overrides it for the worker.
CMD ["pnpm", "--filter", "@palka/web", "start"]
