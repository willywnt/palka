import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { MarketplaceProvider } from '@prisma/client';

import type { OAuthFlowMode, OAuthStatePayload } from '../domain/oauth.types';

const STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret(): string {
  return (
    process.env.MARKETPLACE_OAUTH_STATE_SECRET ?? process.env.MARKETPLACE_ENCRYPTION_SECRET ?? ''
  );
}

function encodePayload(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded: string): OAuthStatePayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    if (!parsed || typeof parsed !== 'object') return null;

    const payload = parsed as OAuthStatePayload;

    if (
      payload.v !== 1 ||
      typeof payload.sub !== 'string' ||
      typeof payload.provider !== 'string' ||
      typeof payload.returnUrl !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.nonce !== 'string'
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createSignedOAuthState(input: {
  userId: string;
  provider: MarketplaceProvider;
  mode: OAuthFlowMode;
  returnUrl: string;
  accountId?: string;
}): string {
  const secret = getStateSecret();

  if (secret.length < 32) {
    throw new Error('MARKETPLACE_OAUTH_STATE_SECRET or MARKETPLACE_ENCRYPTION_SECRET is required');
  }

  const payload: OAuthStatePayload = {
    v: 1,
    sub: input.userId,
    provider: input.provider,
    mode: input.mode,
    accountId: input.accountId,
    returnUrl: input.returnUrl,
    exp: Date.now() + STATE_TTL_MS,
    nonce: randomBytes(16).toString('base64url'),
  };

  const encoded = encodePayload(payload);
  const signature = sign(encoded, secret);

  return `${encoded}.${signature}`;
}

export function verifySignedOAuthState(state: string): OAuthStatePayload | null {
  const secret = getStateSecret();
  const parts = state.split('.');

  if (parts.length !== 2) return null;

  const [encoded, signature] = parts as [string, string];
  const expected = sign(encoded, secret);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = decodePayload(encoded);

  if (!payload || payload.exp < Date.now()) {
    return null;
  }

  return payload;
}
