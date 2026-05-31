import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function decryptMarketplaceToken(payload: string, secret: string): string {
  const parts = payload.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivBase64, authTagBase64, ciphertextBase64] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function safeDecryptMarketplaceToken(
  payload: string | null | undefined,
  secret: string,
): string | null {
  if (!payload) return null;

  try {
    return decryptMarketplaceToken(payload, secret);
  } catch {
    return null;
  }
}

/** Dev-only — not used in worker hot path. */
export function encryptMarketplaceToken(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}
