import { describe, expect, it } from 'vitest';

import { getRequestIp } from '@/lib/api/request-context';

function req(headers: Record<string, string>): Request {
  return new Request('http://localhost/api', { headers });
}

describe('getRequestIp (spoof-resistant client IP)', () => {
  it('takes the RIGHTMOST x-forwarded-for hop (the one the trusted proxy appended)', () => {
    expect(getRequestIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }))).toBe('3.3.3.3');
  });

  it('ignores a spoofed leftmost x-forwarded-for', () => {
    // An attacker sets a fake leftmost value; Traefik appends the real peer LAST, so trusting the
    // rightmost hop defeats the spoof that would otherwise rotate the rate-limit bucket key.
    expect(getRequestIp(req({ 'x-forwarded-for': 'evil-spoof, 9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('trims whitespace and skips empty hops', () => {
    expect(getRequestIp(req({ 'x-forwarded-for': ' , 5.5.5.5 ,  ' }))).toBe('5.5.5.5');
  });

  it('falls back to x-real-ip when there is no x-forwarded-for', () => {
    expect(getRequestIp(req({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
  });

  it('returns "unknown" with no forwarding header (in-process / loopback caller)', () => {
    expect(getRequestIp(req({}))).toBe('unknown');
  });
});
