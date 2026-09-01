// ---------------------------------------------------------------------------
// Pure helpers for the affiliate module (no prisma, no side effects — unit
// tested in tests/unit/affiliates/affiliate.helpers.test.ts).
// ---------------------------------------------------------------------------
import type { Request } from 'express';
import { createHash } from 'node:crypto';

/** Cookie name carrying the referral attribution across the storefront. */
export const AFFILIATE_COOKIE = 'aff_ref';

/** How long an attribution cookie stays valid, in days. */
export const AFFILIATE_COOKIE_DAYS = 30;

/** Referral codes are uppercase A-Z0-9 with an optional dash separator. */
export const AFFILIATE_CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;

/**
 * Build a referral code from the applicant's name, e.g. "MARTIN-7K2F".
 * ASCII-safe, uppercased, no spaces/punctuation; truncated so the whole
 * code stays comfortably inside the 24-char column.
 */
export function generateAffiliateCode(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const base = `${firstName ?? ''}${lastName ?? ''}`
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 12);
  const namePart = base || 'AFF';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${namePart}-${suffix}`;
}

/** True when the code is plausibly formatted (existence check is the DB's job). */
export function isValidAffiliateCode(code: unknown): code is string {
  return typeof code === 'string' && AFFILIATE_CODE_RE.test(code.trim().toUpperCase());
}

/**
 * Read one cookie out of the raw `Cookie` header. The API deliberately has
 * no cookie-parser dependency; this tiny parser is all the affiliate module
 * needs (order placement reads `aff_ref` server-side).
 */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null; // malformed percent-encoding: treat as absent
      }
    }
  }
  return null;
}

/**
 * Commission amount for a paid order: `orderTotal * rate / 100`, rounded to
 * 2 decimal places so SQLite REAL arithmetic (binary floats) cannot leave
 * 0.30000000000000004-style dust in the ledger.
 */
export function commissionAmount(orderTotal: number, rate: number): number {
  return Math.round(orderTotal * rate) / 100;
}

/**
 * Available payout balance: approved commissions minus lifetime paid-out.
 * Negative (e.g. after an admin reject race) is clamped to 0 for display.
 */
export function availableBalance(approvedTotal: number, totalPaid: number): number {
  return Math.max(0, Math.round((approvedTotal - totalPaid) * 100) / 100);
}

/** Round any money value to 2dp (mirror of the wallet module's rounding). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** sha256 of the visitor IP — click metrics without storing raw IPs (PII). */
export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex');
}
