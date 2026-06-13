import { describe, expect, it } from 'vitest';

import { generateInviteCode, INVITE_CODE_PATTERN } from '@/modules/users/utils/invite-code';

/**
 * Invite codes are typed by hand, so the contract is: exactly 8 chars from a
 * 32-symbol alphabet that excludes the ambiguous 0/O/1/I.
 */
describe('generateInviteCode', () => {
  it('produces an 8-char code matching the canonical pattern', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(INVITE_CODE_PATTERN);
    }
  });

  it('never emits the ambiguous characters 0, O, 1, or I', () => {
    const joined = Array.from({ length: 200 }, () => generateInviteCode()).join('');
    expect(joined).not.toMatch(/[0O1I]/);
  });
});
