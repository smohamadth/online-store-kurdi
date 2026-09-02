/**
 * Production must refuse to boot on the credentials shipped in .env.example.
 *
 * `JWT_SECRET: z.string().min(32)` looks like it protects the signing key, but
 * the placeholder in .env.example is
 *
 *     your-super-secret-jwt-key-change-in-production        (46 chars)
 *
 * which satisfies min(32) and is published in this repository. Anyone who
 * copies .env.example, deploys, and forgets to rotate is signing tokens with a
 * value an attacker can read here - they can mint `{ role: "admin" }` and the
 * API honours it. Length validation cannot detect that; only a value check can.
 *
 * These test the predicate directly. The boot-time exit path itself is
 * exercised out-of-process (it calls process.exit), and was verified manually
 * for all four combinations of NODE_ENV x placeholder.
 */
import { describe, it, expect } from 'vitest';
import { isPlaceholderSecret } from '../../../src/config/environment';

describe('isPlaceholderSecret: rejects shipped example values', () => {
  it.each([
    'your-super-secret-jwt-key-change-in-production',
    'minioadmin',
    'changeme',
    'sk_test_your_stripe_secret_key',
    'whsec_your_webhook_secret',
    'password',
    'secret',
  ])('flags %j', (value) => {
    expect(isPlaceholderSecret(value)).toBe(true);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(isPlaceholderSecret('  MinioAdmin  ')).toBe(true);
    expect(isPlaceholderSecret('CHANGEME')).toBe(true);
  });

  it('flags anything still carrying a template marker', () => {
    expect(isPlaceholderSecret('your-api-key-here')).toBe(true);
    expect(isPlaceholderSecret('replace-me-before-launch')).toBe(true);
    expect(isPlaceholderSecret('abc-change-in-production')).toBe(true);
    expect(isPlaceholderSecret('xxxxxxxxxxxx')).toBe(true);
  });
});

describe('isPlaceholderSecret: accepts real secrets', () => {
  it.each([
    // 32 random hex bytes, i.e. `openssl rand -hex 32`
    'f2b1c4a9e07d35a86c1f4b9d2e8a70c3d5f6b1a4e9c7d2ف'.replace('ف', '0'),
    'kZ9vQx2LmN8pR4tW7yB1cE5gH0jK3nP6',
    'a-perfectly-fine-passphrase-with-enough-entropy',
  ])('accepts %j', (value) => {
    expect(isPlaceholderSecret(value)).toBe(false);
  });

  it('treats an unset value as not-a-placeholder (schema handles required)', () => {
    // Optional vars (SMTP_PASS) are legitimately empty; requiredness is the
    // zod schema's job, not this predicate's.
    expect(isPlaceholderSecret(undefined)).toBe(false);
    expect(isPlaceholderSecret('')).toBe(false);
  });

  it('does not flag a secret merely for containing the word secret', () => {
    // "secret" is only rejected as the WHOLE value, not as a substring -
    // otherwise a real high-entropy key containing it would be refused.
    expect(isPlaceholderSecret('Xk2secret9QpLm4vTz8RwYb3NcHd6Fj1A')).toBe(false);
  });
});

describe('the shipped .env.example would be rejected in production', () => {
  it('flags the exact JWT_SECRET line from .env.example', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const example = readFileSync(
      resolve(__dirname, '../../../.env.example'),
      'utf8',
    );

    const line = example.split('\n').find((l) => l.startsWith('JWT_SECRET='));
    expect(line, 'JWT_SECRET must exist in .env.example').toBeTruthy();

    const value = line!.split('=').slice(1).join('=').trim();
    // The whole point: it is long enough to pass zod, and still a placeholder.
    expect(value.length).toBeGreaterThanOrEqual(32);
    expect(isPlaceholderSecret(value)).toBe(true);
  });
});
