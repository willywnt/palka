# Auth.js Production Configuration

Palka uses **Auth.js v5** with JWT sessions and a Credentials provider.

## Required environment variables

```bash
AUTH_SECRET=          # openssl rand -base64 32
AUTH_URL=https://your-domain.com
NEXTAUTH_URL=https://your-domain.com
```

`AUTH_URL` and `NEXTAUTH_URL` must match your production domain exactly (including `https`).

## Generate AUTH_SECRET

```bash
openssl rand -base64 32
```

Minimum 32 characters. Store in the Coolify env as a **Secret**. Rotate periodically — rotation invalidates existing sessions.

## Secure cookies

Auth.js automatically sets secure cookies when:

- `NODE_ENV=production`
- `AUTH_URL` uses `https://`

Configuration in `apps/web/src/auth.config.ts`:

- JWT session strategy (30-day max age)
- `trustHost: true` (required behind the Coolify/Traefik proxy)

No additional cookie config is needed behind the Coolify proxy (HTTPS).

## Production checklist

- [ ] `AUTH_SECRET` is unique per environment (prod ≠ preview)
- [ ] `AUTH_URL` matches the production domain (`app.trypalka.com`)
- [ ] HTTPS enforced (Coolify/Traefik Let's Encrypt)
- [ ] Credentials provider rate limiting (future — add middleware)
- [ ] Passwords hashed with Argon2 (already implemented)

## Session security

- JWT stored in HTTP-only cookie
- No sensitive data in JWT payload (id, email, role only)
- Middleware protects `/dashboard`, `/recordings`, `/settings` routes

## Future OAuth providers

When adding Shopee/Tokopedia OAuth for marketplace, extend `auth.ts` providers array. Keep marketplace tokens separate (encrypted in `MarketplaceConnection` table) — do not store them in Auth.js sessions.

## VPS / self-hosted notes

On the VPS:

- Set `AUTH_URL` to your domain
- Ensure reverse proxy forwards `X-Forwarded-Proto: https`
- Keep `trustHost: true` or set explicit `AUTH_TRUST_HOST`
