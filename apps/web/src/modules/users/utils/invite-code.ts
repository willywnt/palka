import { randomBytes } from 'crypto';

/**
 * Human-shareable invite codes: 8 chars from a 32-symbol alphabet that drops
 * the ambiguous 0/O/1/I. 32 divides 256 evenly, so `byte % 32` carries no
 * modulo bias. Codes are typed by hand at registration, so short + unambiguous
 * matters more than entropy (32^8 ≈ 1.1e12 is plenty for a single-use code
 * guarded by a unique index + retry).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

/** The shape an invite code must take (uppercased, no ambiguous chars). */
export const INVITE_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
