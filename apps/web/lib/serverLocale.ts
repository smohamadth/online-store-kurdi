/**
 * Server-side locale resolution.
 *
 * The i18n hook in `lib/i18n.ts` is a client component: it reads
 * `localStorage.language` and writes `document.documentElement.lang/dir` on
 * mount. That works for hydration, but it means the very first byte the
 * browser receives has `lang="en" dir="ltr"` baked in, even for an
 * Arabic-speaking visitor on a flaky 3G connection. The browser then flashes
 * an LTR layout, then the JS re-renders RTL.
 *
 * This module lets server components (the root layout, in particular) render
 * the correct `<html lang dir>` from the start. The two sources of truth, in
 * priority order, are:
 *
 *   1. The `cms.lang` cookie. The i18n hook does not set a cookie today, so
 *      for now this is mostly empty — but a future i18n rewrite can set it
 *      and immediately get server-side `<html lang>` for free.
 *   2. The `Accept-Language` header. Most browsers send something useful
 *      (e.g. `ku` for Kurdish, `ar` for Arabic, `tr` for Turkish). We use the
 *      first matching language from the supported list.
 *
 * Anything that doesn't resolve falls back to `en / ltr`, which is also the
 * default the client hook starts with — so the server and the client can
 * never disagree.
 *
 * The supported list intentionally matches `languages` in `lib/i18n.ts` so the
 * two sides can't drift.
 */

import { cookies, headers } from 'next/headers';

export type LocaleDir = 'ltr' | 'rtl';
export type LocaleCode = 'en' | 'ku' | 'ar' | 'fa' | 'tr';

interface Locale {
  code: LocaleCode;
  dir: LocaleDir;
}

/**
 * Canonical list. MUST stay in lockstep with `lib/i18n.ts → languages`.
 * Tests pin this so a divergence is caught at CI time, not in production.
 */
export const SUPPORTED_LOCALES: readonly Locale[] = [
  { code: 'en', dir: 'ltr' },
  { code: 'ku', dir: 'rtl' },
  { code: 'ar', dir: 'rtl' },
  { code: 'fa', dir: 'rtl' },
  { code: 'tr', dir: 'ltr' },
] as const;

const DEFAULT_LOCALE: Locale = { code: 'en', dir: 'ltr' };

/**
 * Pick the best entry from a candidate list (cookie value, Accept-Language
 * header values) against the supported list. The first match wins; later
 * candidates are ignored.
 */
function pickBest(candidates: string[]): Locale {
  for (const raw of candidates) {
    const lower = raw.toLowerCase().split(';')[0].trim();
    if (!lower) continue;
    // Accept-Language tags can be `ar`, `ar-IQ`, `ku-Arab-IQ` etc. The first
    // dash separates the primary subtag, which is what we compare against.
    const primary = lower.split('-')[0];
    const match = SUPPORTED_LOCALES.find((l) => l.code === primary);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/**
 * Read the locale for the current request.
 *
 * Async because `cookies()` and `headers()` are async in Next 15+. Safe to
 * call from any server component or generateMetadata; calling it from a
 * client component throws, so the only caller is `app/layout.tsx`.
 */
export async function resolveRequestLocale(): Promise<Locale> {
  let cookieValue: string | undefined;
  let acceptLanguage: string | null = null;
  try {
    cookieValue = (await cookies()).get('cms.lang')?.value;
  } catch {
    // cookies() throws if called outside a request scope (e.g. during static
    // generation of a fully static page). Treat that as "no cookie" and fall
    // through to Accept-Language.
  }
  try {
    acceptLanguage = (await headers()).get('accept-language');
  } catch {
    // Same as above. The static-render case has no Accept-Language either.
  }

  const cookieMatch = cookieValue
    ? SUPPORTED_LOCALES.find((l) => l.code === cookieValue.toLowerCase())
    : undefined;
  if (cookieMatch) return cookieMatch;

  // Split Accept-Language into individual tags and order-preserve them, so
  // e.g. `ku,ar;q=0.9,en;q=0.8` correctly tries ku first. We ignore the
  // quality value because if a browser sent `ar;q=0.9` it still means "I
  // accept Arabic" — quality only ranks, it doesn't exclude.
  const acceptTags = acceptLanguage
    ? acceptLanguage.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  return pickBest(acceptTags);
}
