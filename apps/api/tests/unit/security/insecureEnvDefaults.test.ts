/**
 * Security switches must never be driven by an ambient NODE_ENV default.
 *
 * `NODE_ENV` is declared as
 *     z.enum(['development','production','test']).default('development')
 * so an operator who deploys WITHOUT setting it gets 'development'. Any check
 * of the form `NODE_ENV !== 'production'` or `NODE_ENV === 'development'` is
 * therefore fail-open: forgetting one environment variable silently turns the
 * protection off on a real server.
 *
 * Two such switches existed, and both were reachable by an unauthenticated
 * caller:
 *
 *   1. inventory 3PL webhook - `mockAccept: NODE_ENV !== 'production'`, and
 *      mockAccept accepts ANY non-empty X-Signature. Stock levels for any SKU
 *      could be moved by posting `X-Signature: x`.
 *   2. POST /api/auth/forgot-password - spread `resetToken` into the JSON
 *      response when `NODE_ENV === 'development'`. That hands a working
 *      password-reset token for any email to an anonymous caller: account
 *      takeover, on an endpoint otherwise careful not even to disclose whether
 *      an account exists.
 *
 * These tests pin the fixed behaviour and guard the general pattern.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { verifyWebhookSignature } from '../../../src/modules/inventory/inventory.helpers';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_EXPOSE = process.env.EXPOSE_RESET_TOKEN;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
  if (ORIGINAL_EXPOSE === undefined) delete process.env.EXPOSE_RESET_TOKEN;
  else process.env.EXPOSE_RESET_TOKEN = ORIGINAL_EXPOSE;
});

const SECRET = 'shared-3pl-secret';
const BODY = JSON.stringify({ events: [{ type: 'adjust', sku: 'ABC', quantity: 5 }] });
const VALID = crypto.createHmac('sha256', SECRET).update(BODY, 'utf8').digest('hex');

describe('3PL webhook signature verification', () => {
  it('accepts a correctly computed HMAC', () => {
    expect(verifyWebhookSignature(SECRET, BODY, VALID)).toBe(true);
  });

  it.each([
    ['a forged one-char signature', 'x'],
    ['an empty signature', ''],
    ['a wrong-but-same-length digest', 'a'.repeat(VALID.length)],
    ['a truncated valid signature', VALID.slice(0, -1)],
    ['a signature for a different body', crypto.createHmac('sha256', SECRET).update('other').digest('hex')],
    ['a signature under a different secret', crypto.createHmac('sha256', 'wrong').update(BODY).digest('hex')],
  ])('rejects %s', (_label, sig) => {
    expect(verifyWebhookSignature(SECRET, BODY, sig)).toBe(false);
  });

  it('rejects a forged signature with no opts, whatever NODE_ENV says', () => {
    // The route now calls the 3-arg form. Even on a box where NODE_ENV is the
    // default 'development', a forged signature must not authenticate.
    for (const envv of ['development', 'test', 'production']) {
      process.env.NODE_ENV = envv;
      expect(verifyWebhookSignature(SECRET, BODY, 'x'), `NODE_ENV=${envv}`).toBe(false);
    }
  });

  it('ignores the mockAccept test hatch in production', () => {
    process.env.NODE_ENV = 'production';
    expect(verifyWebhookSignature(SECRET, BODY, 'x', { mockAccept: true })).toBe(false);
    // ...and the real signature still works.
    expect(verifyWebhookSignature(SECRET, BODY, VALID, { mockAccept: true })).toBe(true);
  });

  it('still honours mockAccept for unit tests outside production', () => {
    process.env.NODE_ENV = 'test';
    expect(verifyWebhookSignature(SECRET, BODY, 'anything', { mockAccept: true })).toBe(true);
  });
});

describe('password-reset token exposure', () => {
  async function freshExposeResetToken() {
    // The module reads process.env at call time, so a plain import is fine.
    const mod = await import('../../../src/config/environment');
    return mod.exposeResetToken;
  }

  it('is OFF by default in development (the old fail-open case)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.EXPOSE_RESET_TOKEN;
    expect((await freshExposeResetToken())()).toBe(false);
  });

  it('is OFF in production even when explicitly requested', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPOSE_RESET_TOKEN = 'true';
    expect((await freshExposeResetToken())()).toBe(false);
  });

  it('is ON only with an explicit opt-in outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EXPOSE_RESET_TOKEN = 'true';
    expect((await freshExposeResetToken())()).toBe(true);
  });

  it('treats any value other than the exact string "true" as off', async () => {
    process.env.NODE_ENV = 'development';
    for (const v of ['1', 'yes', 'TRUE', 'on', '']) {
      process.env.EXPOSE_RESET_TOKEN = v;
      expect((await freshExposeResetToken())(), `EXPOSE_RESET_TOKEN=${v}`).toBe(false);
    }
  });
});

describe('no security switch keys off an ambient NODE_ENV default', () => {
  // Source-level ratchet. NODE_ENV defaults to 'development', so gating a
  // protection on it is fail-open. Annotate a reviewed exception with
  // `env-default-ok: <reason>`.
  const SRC = resolve(__dirname, '../../../src');

  const RISKY = [
    /NODE_ENV\s*!==\s*['"]production['"]/,
    /NODE_ENV\s*===\s*['"]development['"]/,
  ];

  it('finds no unreviewed fail-open NODE_ENV check', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    const files: string[] = [];
    (function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith('.ts') && !full.includes('.test.')) files.push(full);
      }
    })(SRC);

    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        if (!RISKY.some((r) => r.test(line))) return;
        const context = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
        if (/env-default-ok/.test(context)) return;
        offenders.push(`${file.replace(SRC, 'src')}:${i + 1}: ${trimmed}`);
      });
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
