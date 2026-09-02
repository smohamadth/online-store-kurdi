/**
 * Unit tests for the pure affiliate helpers (no prisma, no IO).
 *
 * Covers: referral-code generation, cookie parsing (the API has no
 * cookie-parser dependency — the affiliate module parses the raw Cookie
 * header itself), commission amount math, balance math, and IP hashing.
 */
import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import {
  generateAffiliateCode,
  isValidAffiliateCode,
  readCookie,
  commissionAmount,
  availableBalance,
  roundMoney,
  hashIp,
  AFFILIATE_COOKIE,
  AFFILIATE_CODE_RE,
} from '../../../src/modules/affiliates/affiliate.helpers';

function reqWith(cookieHeader: string | undefined): Request {
  return { headers: cookieHeader ? { cookie: cookieHeader } : {} } as Request;
}

describe('generateAffiliateCode', () => {
  it('builds NAME-XXXX codes from the applicant name', () => {
    const code = generateAffiliateCode('Martin', 'Kurdi');
    expect(code).toMatch(/^MARTINKURDI-[A-Z0-9]{4}$/);
  });

  it('uppercases, strips non-alphanumerics, and handles Kurdish names', () => {
    const code = generateAffiliateCode('ژیار', 'محمد');
    // Non-ASCII (Kurdish/Arabic) letters are stripped by normalization;
    // the fallback prefix keeps the code valid ASCII.
    expect(code).toMatch(/^AFF-[A-Z0-9]{4}$/);
  });

  it('truncates very long names to keep the code inside the column limit', () => {
    const code = generateAffiliateCode('Alexander', 'Constantinople');
    expect(code.length).toBeLessThanOrEqual(24);
    expect(code).toMatch(/^[A-Z0-9-]{1,23}$/);
  });

  it('generates different codes on consecutive calls', () => {
    const a = generateAffiliateCode('Sara', 'Ali');
    const b = generateAffiliateCode('Sara', 'Ali');
    expect(a).not.toBe(b);
  });
});

describe('isValidAffiliateCode', () => {
  it('accepts well-formed codes and rejects junk', () => {
    expect(isValidAffiliateCode('MARTIN-7K2F')).toBe(true);
    expect(isValidAffiliateCode('ABC123')).toBe(true);
    expect(isValidAffiliateCode('martin-7k2f')).toBe(true); // normalised later
    expect(isValidAffiliateCode('')).toBe(false);
    expect(isValidAffiliateCode('ab cd')).toBe(false);
    expect(isValidAffiliateCode('A'.repeat(60))).toBe(false);
    expect(isValidAffiliateCode('REF; DROP TABLE users')).toBe(false);
    expect(isValidAffiliateCode(42)).toBe(false);
    expect(isValidAffiliateCode(null)).toBe(false);
  });

  it('is anchored so a code cannot smuggle extra header content', () => {
    expect('X-1; aff_ref=EVIL'.match(AFFILIATE_CODE_RE)).toBeNull();
  });
});

describe('readCookie', () => {
  it('reads the target cookie from a multi-cookie header', () => {
    const req = reqWith('other=1; aff_ref=ABC-123; lang=ku');
    expect(readCookie(req, AFFILIATE_COOKIE)).toBe('ABC-123');
  });

  it('returns null when the cookie is absent or the header is missing', () => {
    expect(readCookie(reqWith(undefined), AFFILIATE_COOKIE)).toBe(null);
    expect(readCookie(reqWith('other=1'), AFFILIATE_COOKIE)).toBe(null);
  });

  it('decodes percent-encoded values and tolerates whitespace', () => {
    expect(readCookie(reqWith('aff_ref=MY%2DCODE '), AFFILIATE_COOKIE)).toBe('MY-CODE');
  });

  it('returns null for a malformed percent-encoding instead of throwing', () => {
    expect(readCookie(reqWith('aff_ref=%E0%A4%A'), AFFILIATE_COOKIE)).toBe(null);
  });

  it('matches the cookie name exactly, not as a prefix', () => {
    const req = reqWith('aff_ref_x=EVIL; aff_ref=GOOD');
    expect(readCookie(req, AFFILIATE_COOKIE)).toBe('GOOD');
  });
});

describe('commissionAmount', () => {
  it('computes rate percent of the order total', () => {
    expect(commissionAmount(100, 10)).toBe(10);
    expect(commissionAmount(250.5, 15)).toBe(37.58); // 37.575 -> 37.58
  });

  it('rounds to 2dp so binary-float dust never reaches the ledger', () => {
    // 33.33 * 0.1 = 3.333000000000000... -> 3.33
    expect(commissionAmount(33.33, 10)).toBe(3.33);
    // 0.1 + 0.2 style floats
    expect(commissionAmount(0.1, 50)).toBe(0.05);
  });

  it('handles 0 rate and 0 total', () => {
    expect(commissionAmount(100, 0)).toBe(0);
    expect(commissionAmount(0, 10)).toBe(0);
  });
});

describe('availableBalance', () => {
  it('is approved minus paid, clamped at 0', () => {
    expect(availableBalance(50, 20)).toBe(30);
    expect(availableBalance(50, 50)).toBe(0);
    expect(availableBalance(50, 70)).toBe(0);
    expect(availableBalance(0, 0)).toBe(0);
  });

  it('rounds to 2dp', () => {
    expect(availableBalance(10.005, 0)).toBe(10.01);
  });
});

describe('roundMoney', () => {
  it('rounds binary-float money to clean cents', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(2.675)).toBe(2.68);
  });
});

describe('hashIp', () => {
  it('hashes an IP deterministically without storing the raw value', () => {
    const h = hashIp('203.0.113.7');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp('203.0.113.7')).toBe(h);
    expect(hashIp('203.0.113.7')).not.toBe(hashIp('198.51.100.1'));
  });

  it('returns null for missing IPs', () => {
    expect(hashIp(undefined)).toBe(null);
  });
});
