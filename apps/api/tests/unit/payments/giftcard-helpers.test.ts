/**
 * Unit tests for the gift-card pure helpers.
 *
 * `generateGiftCardCode`, `normaliseCode`, and `isRedeemable` are
 * pure - no prisma required. The integration test covers the I/O
 * path (issue, debit, credit, cancel).
 */
import { describe, it, expect } from 'vitest';
import {
  generateGiftCardCode,
  normaliseCode,
  isRedeemable,
  publicGiftCardView,
} from '../../../src/modules/payments/giftcard.helpers';

describe('generateGiftCardCode', () => {
  it('returns a 19-character string in XXXX-XXXX-XXXX-XXXX format', () => {
    const code = generateGiftCardCode();
    expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(code).toHaveLength(19);
  });

  it('returns uppercase characters only (so case-insensitive matching works)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateGiftCardCode();
      expect(code).toBe(code.toUpperCase());
    }
  });

  it('produces different codes on consecutive calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) codes.add(generateGiftCardCode());
    expect(codes.size).toBe(100);
  });
});

describe('normaliseCode', () => {
  it('uppercases the input', () => {
    expect(normaliseCode('abcd-efgh-ijkl-mnop')).toBe('ABCDEFGHIJKLMNOP');
  });

  it('strips dashes', () => {
    expect(normaliseCode('1234-5678-9012-3456')).toBe('1234567890123456');
  });

  it('strips whitespace (e.g. customer copy-paste with a space)', () => {
    expect(normaliseCode('  ABCD  EFGH  ')).toBe('ABCDEFGH');
  });

  it('returns empty string for empty input', () => {
    expect(normaliseCode('')).toBe('');
  });
});

describe('isRedeemable', () => {
  const now = new Date('2026-08-01T00:00:00.000Z');
  const baseCard = {
    id: 'g1', code: 'TEST-1234-5678-90AB', initialAmount: 100, balance: 50,
    currency: 'USD', status: 'active', issuedAt: now,
    expiresAt: null as Date | null, redeemedByUserId: null,
    redeemedAt: null, notes: null, createdById: null, createdAt: now,
  };

  it('returns true for an active card with balance and no expiry', () => {
    expect(isRedeemable(baseCard, now)).toBe(true);
  });

  it('returns false for an expired card', () => {
    const card = { ...baseCard, expiresAt: new Date('2026-07-01') };
    expect(isRedeemable(card, now)).toBe(false);
  });

  it('returns true for a card that expires in the future', () => {
    const card = { ...baseCard, expiresAt: new Date('2026-09-01') };
    expect(isRedeemable(card, now)).toBe(true);
  });

  it('returns false for a depleted card (balance = 0)', () => {
    const card = { ...baseCard, balance: 0 };
    expect(isRedeemable(card, now)).toBe(false);
  });

  it('returns false for a cancelled card regardless of balance', () => {
    const card = { ...baseCard, status: 'cancelled', balance: 50 };
    expect(isRedeemable(card, now)).toBe(false);
  });

  it('returns false for a depleted card whose status is "depleted"', () => {
    const card = { ...baseCard, status: 'depleted' };
    expect(isRedeemable(card, now)).toBe(false);
  });
});

describe('publicGiftCardView', () => {
  it('redacts PII: no createdById, no notes, no internal id', () => {
    const card = {
      id: 'g1',
      code: 'ABCD-1234-5678-90EF',
      initialAmount: 100,
      balance: 50,
      currency: 'USD',
      status: 'active' as const,
      issuedAt: new Date('2026-01-01'),
      expiresAt: new Date('2027-01-01'),
      redeemedByUserId: 'u1',
      redeemedAt: new Date('2026-02-01'),
      notes: 'PRIVATE - internal note',
      createdById: 'admin-1',
      createdAt: new Date('2026-01-01'),
    };
    const view = publicGiftCardView(card);
    expect(view.code).toBe('ABCD-1234-5678-90EF');
    expect(view.balance).toBe(50);
    expect(view.status).toBe('active');
    // Redacted fields
    expect((view as any).id).toBeUndefined();
    expect((view as any).notes).toBeUndefined();
    expect((view as any).createdById).toBeUndefined();
    expect((view as any).redeemedByUserId).toBeUndefined();
  });
});
