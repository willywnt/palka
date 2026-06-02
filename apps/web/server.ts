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

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function createNodeServer(useHttps: boolean): HttpServerInstance {
  if (!useHttps) {
    return createHttpServer();
  }

  const cert = selfsigned.generate([{ name: 'commonName', value: 'olshop-local-dev' }], {
    days: 365,
    keySize: 2048,
  });

  return createHttpsServer({ key: cert.private, cert: cert.cert });
}

function isSocketIoPath(pathname: string): boolean {
  return pathname === SOCKET_PATH || pathname.startsWith(`${SOCKET_PATH}/`);
}

app.prepare().then(() => {
  // Next reloads apps/web/.env.local during prepare — read DEV_HTTPS after that.
  const useDevHttps = isDevHttpsEnabled();

  const httpServer = createNodeServer(useDevHttps);

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

    console.log('');
  });
});
