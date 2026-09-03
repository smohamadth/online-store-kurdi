/**
 * Newsletter consent helpers.
 *
 * The original model was id/email/createdAt: no unsubscribe token and no
 * consent record, so the store was collecting addresses it could not lawfully
 * or technically mail. These pin the pieces that make the list mailable.
 */
import { describe, it, expect } from 'vitest';
import {
  SUBSCRIBED, UNSUBSCRIBED, VALID_SOURCES,
  generateUnsubscribeToken, normalizeEmail, normalizeSource,
  truncateIp, buildUnsubscribeUrl, decideSubscribe,
} from '../../../src/modules/newsletter/newsletter.helpers';

describe('generateUnsubscribeToken', () => {
  it('is 64 hex chars (32 bytes of entropy)', () => {
    const t = generateUnsubscribeToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats across many draws', () => {
    // The token is the only credential protecting an unsubscribe, so a
    // collision would let one recipient unsubscribe another.
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateUnsubscribeToken());
    expect(seen.size).toBe(2000);
  });

  it('is not derived from anything guessable', () => {
    // Two calls in the same millisecond must differ - i.e. it is not seeded
    // from a timestamp or a counter.
    const a = generateUnsubscribeToken();
    const b = generateUnsubscribeToken();
    expect(a).not.toBe(b);
  });
});

describe('normalizeEmail', () => {
  it.each([
    ['A@X.com', 'a@x.com'],
    ['  spaced@example.com  ', 'spaced@example.com'],
    ['MiXeD@CaSe.IO', 'mixed@case.io'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('collapses case variants to one mailbox', () => {
    // Two rows for one human means two copies of every mailing and an
    // unsubscribe that only silences one of them.
    expect(normalizeEmail('Bob@Example.com')).toBe(normalizeEmail('bob@example.COM'));
  });

  it('tolerates null/undefined without throwing', () => {
    expect(normalizeEmail(undefined as any)).toBe('');
    expect(normalizeEmail(null as any)).toBe('');
  });
});

describe('normalizeSource', () => {
  it('accepts every documented source', () => {
    for (const s of VALID_SOURCES) expect(normalizeSource(s)).toBe(s);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeSource('  CheckOut ')).toBe('checkout');
  });

  it.each([['nonsense'], [''], [null], [undefined], [42], [{}]])(
    'falls back to footer for %j',
    (bad) => {
      expect(normalizeSource(bad)).toBe('footer');
    },
  );

  it('does not let a client store arbitrary text', () => {
    // Otherwise the consent record becomes attacker-controlled free text.
    expect(normalizeSource('<script>alert(1)</script>')).toBe('footer');
  });
});

describe('truncateIp', () => {
  it('drops the last octet of an IPv4 address', () => {
    expect(truncateIp('203.0.113.42')).toBe('203.0.113.0');
  });

  it('unwraps IPv4-mapped IPv6 before truncating', () => {
    expect(truncateIp('::ffff:198.51.100.7')).toBe('198.51.100.0');
  });

  it('keeps only the first three groups of an IPv6 address', () => {
    expect(truncateIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::');
  });

  it.each([[null], [undefined], [''], ['   '], ['not-an-ip'], ['1.2.3']])(
    'returns null for %j rather than storing junk',
    (bad) => {
      expect(truncateIp(bad as any)).toBeNull();
    },
  );

  it('never returns a full address', () => {
    const out = truncateIp('192.168.1.99');
    expect(out).not.toContain('99');
    expect(out).toBe('192.168.1.0');
  });
});

describe('buildUnsubscribeUrl', () => {
  it('builds a token link against the API base', () => {
    expect(buildUnsubscribeUrl('https://shop.example', 'abc123'))
      .toBe('https://shop.example/api/newsletter/unsubscribe?token=abc123');
  });

  it('does not double up slashes when the base has a trailing one', () => {
    expect(buildUnsubscribeUrl('https://shop.example/', 'abc'))
      .toBe('https://shop.example/api/newsletter/unsubscribe?token=abc');
  });

  it('URL-encodes the token so a stray character cannot break the link', () => {
    expect(buildUnsubscribeUrl('https://x.io', 'a b&c=d')).toContain('token=a%20b%26c%3Dd');
  });
});

describe('decideSubscribe', () => {
  it('creates a row for an unknown address', () => {
    expect(decideSubscribe(null)).toEqual({ action: 'create' });
    expect(decideSubscribe(undefined)).toEqual({ action: 'create' });
  });

  it('is a no-op for someone already subscribed', () => {
    // Duplicate signup must not overwrite the original consentAt - that
    // timestamp is the evidence of when they first agreed.
    expect(decideSubscribe({ status: SUBSCRIBED })).toEqual({ action: 'noop' });
  });

  it('reactivates someone who previously opted out', () => {
    // Deliberately signing up again IS fresh consent, so this must not stay
    // silently unsubscribed - but it also must not be a plain create, which
    // would collide on the unique email.
    expect(decideSubscribe({ status: UNSUBSCRIBED })).toEqual({ action: 'resubscribe' });
  });

  it('treats an unrecognised status as already-subscribed rather than resubscribing', () => {
    expect(decideSubscribe({ status: 'bounced' })).toEqual({ action: 'noop' });
  });
});
