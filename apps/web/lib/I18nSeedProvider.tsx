'use client';

import type { ReactNode } from 'react';
import { I18nSeedContext } from './i18n';

/**
 * Provider for the SSR-resolved locale seed. See `lib/i18n.ts` for the
 * contract this satisfies: useTranslation() reads the seed to pick its
 * initial state, so the first client render matches the server-rendered
 * `<html lang dir>` instead of flashing back to English/LTR.
 *
 * Lives in a `.tsx` file (rather than the i18n.ts) because the provider
 * needs JSX and renaming i18n.ts to .tsx would force every importer to
 * update its path.
 */
export function I18nSeedProvider({
  value,
  children,
}: {
  value: { lang: string; dir: 'ltr' | 'rtl' };
  children: ReactNode;
}) {
  return <I18nSeedContext.Provider value={value}>{children}</I18nSeedContext.Provider>;
}
