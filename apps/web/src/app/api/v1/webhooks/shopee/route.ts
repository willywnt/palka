import { getServerEnv } from '@palka/config/env.server';
import { parseShopeePush, SHOPEE_PUSH_CODE, verifyShopeePush } from '@palka/marketplace-providers';
import { after, NextResponse } from 'next/server';

import { appLogger } from '@/lib/logger';
import { marketplaceServerService } from '@/modules/marketplace/services/marketplace-server.service';
import { ordersServerService } from '@/modules/orders/services/orders-server.service';

/** The registered callback path (part of the push signature base — keep in sync with registration). */
const WEBHOOK_PATH = '/api/v1/webhooks/shopee';

/**
 * PUBLIC Shopee push receiver. Shopee calls this from the internet, so it carries NO Palka session
 * and CANNOT use the internal-endpoint guard (which 403s public IPs) — the ONLY auth is the push
 * signature: HMAC-SHA256(partner_key, `${callbackUrl}|${rawBody}`), verified over the RAW request
 * bytes against the exact registered callback URL. A push is a thin TRIGGER (order_sn + status only),
 * so we ack 2xx FAST (<3s, or Shopee suspends the URL) and run the incremental pull AFTER the response
 * — the pull (get_order_list since the cursor) is the source of truth and hydrates the full order. The
 * upsert-based ingest is idempotent, so at-least-once delivery + duplicates are safe.
 */
export const runtime = 'nodejs';

function readString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

/** The URL Shopee is configured to call — must match the signature base exactly (never request.url). */
function resolveCallbackUrl(): string {
  const configured = getServerEnv().SHOPEE_PUSH_CALLBACK_URL;
  if (configured) return configured;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return `${base}${WEBHOOK_PATH}`;
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const push = parseShopeePush(rawBody);

  // 0. REGISTRATION / VERIFICATION PING (code 0). set_app_push_config test-pushes the callback URL and
  //    passes it purely on a fast 2xx (the ping may be UNSIGNED), so answer BEFORE the HMAC check — echo
  //    `verify_info` back when present. It carries no order side effect, so skipping verification is safe.
  if (push && push.code === SHOPEE_PUSH_CODE.VERIFY) {
    const verifyInfo = typeof push.data.verify_info === 'string' ? push.data.verify_info : null;
    appLogger.info('marketplace.shopee.push.verify_ping', { echoed: verifyInfo !== null });
    return NextResponse.json(
      verifyInfo !== null ? { code: 0, data: { verify_info: verifyInfo } } : { ok: true },
      { status: 200 },
    );
  }

  // 1. VERIFY over the raw bytes — the only auth for a real push (fail-closed).
  const verified = verifyShopeePush({
    callbackUrl: resolveCallbackUrl(),
    rawBody,
    authorizationHeader: request.headers.get('authorization'),
    partnerKey: getServerEnv().SHOPEE_PARTNER_KEY ?? '',
  });
  if (!verified) {
    appLogger.warn('marketplace.shopee.push.rejected', { reason: 'bad_signature' });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. The (now authentic) envelope was parsed above. A malformed authentic body is odd — log + 200
  //    (don't make Shopee retry forever).
  if (!push) {
    appLogger.warn('marketplace.shopee.push.unparseable', {});
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const shopId = push.shopId ?? readString(push.data.shop_id);

  // 3. DISPATCH by code. Everything here must be FAST — the actual pull is deferred via after().
  switch (push.code) {
    case SHOPEE_PUSH_CODE.ORDER_STATUS:
    case SHOPEE_PUSH_CODE.TRACKING_NUMBER: {
      if (!shopId) {
        appLogger.warn('marketplace.shopee.push.no_shop', { code: push.code });
        break;
      }
      const connection = await marketplaceServerService.findConnectionByShop('SHOPEE', shopId);
      if (!connection) {
        // Verify passed but no live connection for this shop — log + 200 (never 4xx/5xx a real push).
        appLogger.warn('marketplace.shopee.push.no_connection', { shopId, code: push.code });
        break;
      }
      appLogger.info('marketplace.shopee.push.order', {
        shopId,
        code: push.code,
        connectionId: connection.id,
      });
      // Trigger an immediate incremental pull for THIS shop only (force = bypass the 30s cooldown so a
      // push right after a scheduled pull isn't dropped). Runs after the 2xx ack.
      after(async () => {
        try {
          await ordersServerService.pullFromConnections(
            connection.organizationId,
            connection.userId,
            { connectionIds: [connection.id], force: true },
          );
        } catch (error) {
          appLogger.warn('marketplace.shopee.push.pull_failed', {
            connectionId: connection.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
      break;
    }
    case SHOPEE_PUSH_CODE.SHOP_DEAUTHORIZATION: {
      if (shopId) {
        const deactivated = await marketplaceServerService.deactivateConnectionByShop(
          'SHOPEE',
          shopId,
        );
        appLogger.info('marketplace.shopee.push.deauthorized', { shopId, deactivated });
      } else {
        appLogger.warn('marketplace.shopee.push.deauth_no_shop', {});
      }
      break;
    }
    case SHOPEE_PUSH_CODE.AUTH_EXPIRY: {
      // Token refresh is already reactive + proactive in the sync/import/drift/pull paths — just note it.
      appLogger.info('marketplace.shopee.push.auth_expiry', { shopId });
      break;
    }
    default:
      appLogger.debug('marketplace.shopee.push.ignored', { code: push.code });
  }

  // Always 2xx for an authentic push — a 4xx/5xx storm degrades Shopee's live_push_status to Suspended.
  return NextResponse.json({ ok: true }, { status: 200 });
}

/**
 * Shopee may probe the callback with a bare GET during setup (some registration flows connectivity-check
 * the URL) — answer 200 fast so the "Verify" step never sees a non-2xx. No auth: a GET carries no push.
 */
export function GET(): Response {
  return NextResponse.json({ ok: true }, { status: 200 });
}
