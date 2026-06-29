import { join } from 'path';
import { createServer as createHttpServer, type Server as HttpServerInstance } from 'http';
import { createServer as createHttpsServer } from 'https';
import { parse } from 'url';

import { loadEnvConfig } from '@next/env';
import next from 'next';
import selfsigned from 'selfsigned';

import { isDevHttpsEnabled } from './src/lib/dev-https';
import {
  getLocalLanIPv4,
  resolveDesktopDevOrigin,
  resolveMobilePairingOrigin,
} from './src/modules/scanner-pairing/utils/resolve-public-origin';
import { SOCKET_PATH } from './src/modules/scanner-pairing/config';
import { initPairingSocketServer } from './socket-server/io-server';

const appDir = __dirname;
const rootDir = join(__dirname, '../..');

// Root .env (DATABASE_URL, etc.) then apps/web/.env.local (DEV_HTTPS, NEXT_PUBLIC_*)
loadEnvConfig(rootDir);
loadEnvConfig(appDir);

const dev = process.env.NODE_ENV !== 'production';
/** Bind all interfaces in dev so phones on the same Wi‑Fi can reach the app. */
const hostname = process.env.HOSTNAME ?? (dev ? '0.0.0.0' : 'localhost');
const port = Number(process.env.PORT ?? 3000);

// Use Turbopack for dev compilation (much faster route compiles than webpack on Windows).
// Gated on `dev` so the prod custom server (`tsx server.ts`) keeps using the webpack build.
const app = next({ dev, hostname, port, turbopack: dev });
const handle = app.getRequestHandler();

async function createNodeServer(useHttps: boolean): Promise<HttpServerInstance> {
  if (!useHttps) {
    return createHttpServer();
  }

  // selfsigned v5+ generates asynchronously; validity defaults to 365 days.
  const cert = await selfsigned.generate([{ name: 'commonName', value: 'palka-local-dev' }], {
    keySize: 2048,
  });

  return createHttpsServer({ key: cert.private, cert: cert.cert });
}

function isSocketIoPath(pathname: string): boolean {
  return pathname === SOCKET_PATH || pathname.startsWith(`${SOCKET_PATH}/`);
}

/**
 * Bearer secret for the loopback-only internal endpoints (auto-pull, finance auto-gen). Prefers a
 * dedicated INTERNAL_API_SECRET; falls back to AUTH_SECRET so a deploy that hasn't set the
 * dedicated secret yet keeps working. Must match the route guard in lib/api/internal-request.ts.
 */
function internalEndpointSecret(): string | undefined {
  return process.env.INTERNAL_API_SECRET ?? process.env.AUTH_SECRET;
}

/**
 * Periodic order pull (VPS/self-hosted). Hits the secret-gated internal endpoint on loopback so
 * the order-ingest module graph resolves inside Next (the bootstrap can't import it directly).
 * Off by default (ORDERS_AUTO_PULL_INTERVAL_MS unset/0); runs only where this custom server runs
 * (the VPS host, or dev). Skipped under DEV_HTTPS — prod serves http behind a TLS proxy.
 */
function startScheduledOrderPull(useHttps: boolean): void {
  const intervalMs = Number(process.env.ORDERS_AUTO_PULL_INTERVAL_MS ?? 0);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

  const secret = internalEndpointSecret();
  if (!secret) {
    console.warn(
      '> Auto-pull disabled: INTERNAL_API_SECRET (or AUTH_SECRET) is required to call the internal endpoint.',
    );
    return;
  }
  if (useHttps) {
    console.warn('> Auto-pull skipped under DEV_HTTPS (intended for the http prod server).');
    return;
  }

  const url = `http://127.0.0.1:${port}/api/v1/internal/pull-orders`;
  // Bound each loopback request so a hung connection can't leave `pulling` stuck true
  // forever (which would silently wedge auto-pull). Generous — a healthy multi-store pull
  // finishes well under this; this only catches a truly dead request.
  const requestTimeoutMs = Math.max(intervalMs, 5 * 60_000);
  let pulling = false;
  console.log(`> Auto-pull enabled: every ${Math.round(intervalMs / 1000)}s`);

  const timer = setInterval(() => {
    if (pulling) return; // never overlap a slow pull
    pulling = true;
    fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
      .then((res) => {
        if (!res.ok) console.warn(`> Auto-pull HTTP ${res.status}`);
      })
      .catch((error) => console.warn('> Auto-pull request failed', error))
      .finally(() => {
        pulling = false;
      });
  }, intervalMs);
  timer.unref();
}

/**
 * Monthly finance auto-generation (VPS/self-hosted). On the 1st of each month (UTC) it hits the
 * secret-gated internal endpoint, which for every org materializes this month's recurring opex +
 * finalizes last month's auto-derived fees. Off unless FINANCE_AUTOGEN_ENABLED=true. Re-checks a
 * few times a day (the work is idempotent) so a missed midnight or a daytime restart still runs it.
 * Skipped under DEV_HTTPS — prod serves http behind a TLS proxy.
 */
function startScheduledFinanceAutogen(useHttps: boolean): void {
  if (process.env.FINANCE_AUTOGEN_ENABLED !== 'true') return;

  const secret = internalEndpointSecret();
  if (!secret) {
    console.warn(
      '> Finance auto-gen disabled: INTERNAL_API_SECRET (or AUTH_SECRET) is required to call the internal endpoint.',
    );
    return;
  }
  if (useHttps) {
    console.warn('> Finance auto-gen skipped under DEV_HTTPS (intended for the http prod server).');
    return;
  }

  const url = `http://127.0.0.1:${port}/api/v1/internal/finance-generate`;
  const checkIntervalMs = 6 * 60 * 60 * 1000; // re-check every 6h; only fires on day 1
  let lastRunMonth = '';
  let running = false;

  const tick = (): void => {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
    if (now.getUTCDate() !== 1 || monthKey === lastRunMonth || running) return;
    running = true;
    fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10 * 60_000),
    })
      .then((res) => {
        if (res.ok) lastRunMonth = monthKey;
        else console.warn(`> Finance auto-gen HTTP ${res.status}`);
      })
      .catch((error) => console.warn('> Finance auto-gen request failed', error))
      .finally(() => {
        running = false;
      });
  };

  const timer = setInterval(tick, checkIntervalMs);
  timer.unref();
  tick(); // also check on boot (covers a restart that lands on the 1st)
  console.log('> Finance auto-gen enabled (fires on the 1st of each month, UTC)');
}

app.prepare().then(async () => {
  // Next reloads apps/web/.env.local during prepare — read DEV_HTTPS after that.
  const useDevHttps = isDevHttpsEnabled();

  const httpServer = await createNodeServer(useDevHttps);

  // Attach Socket.IO before Next so Engine.IO polling is not swallowed by the App Router
  initPairingSocketServer(httpServer);

  httpServer.on('request', async (req, res) => {
    try {
      const parsedUrl = parse(req.url ?? '/', true);
      const pathname = parsedUrl.pathname ?? '/';

      if (isSocketIoPath(pathname) || res.writableEnded) {
        return;
      }

      await handle(req, res, parsedUrl);
    } catch (error) {
      console.error('Request handler error', error);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  httpServer.listen(port, hostname, () => {
    const scheme = useDevHttps ? 'https' : 'http';

    console.log('');
    console.log(`> Server listening on ${hostname}:${port} (${scheme})`);
    console.log(`> DEV_HTTPS=${process.env.DEV_HTTPS ?? '(unset, default true)'}`);

    if (dev) {
      const desktopUrl = resolveDesktopDevOrigin();
      const mobileUrl = resolveMobilePairingOrigin();
      const lanIp = process.env.PAIRING_LAN_HOST ?? getLocalLanIPv4();

      console.log(`> Desktop (this PC):  ${desktopUrl}`);
      console.log(`> Mobile (QR/phone):  ${mobileUrl}`);
      if (lanIp) {
        console.log(`> LAN interface:    ${lanIp}`);
      }
      const pairingEnv = process.env.NEXT_PUBLIC_PAIRING_URL?.trim();
      if (useDevHttps && pairingEnv?.startsWith('http://') && !pairingEnv.includes('localhost')) {
        console.warn(
          '> NEXT_PUBLIC_PAIRING_URL is http:// but DEV_HTTPS is on — QR/API use https:// instead.',
        );
      }

      if (useDevHttps) {
        console.log(
          '> HTTPS enabled — use https:// in the browser (accept cert warning on phone).',
        );
        console.log(`> Desktop: open ${desktopUrl} and trust the certificate once.`);
      } else {
        console.log('> HTTP mode — use http://localhost:3000 on this PC.');
        console.log('> Note: phone camera may need DEV_HTTPS=true (https LAN URL) for scanning.');
      }
      console.log(`> Socket: ${desktopUrl}/api/socket`);
    } else {
      console.log(`> Ready on ${scheme}://localhost:${port}`);
    }

    startScheduledOrderPull(useDevHttps);
    startScheduledFinanceAutogen(useDevHttps);

    console.log('');
  });
});
