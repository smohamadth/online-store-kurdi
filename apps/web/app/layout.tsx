import './globals.css';
import type { Metadata, Viewport } from 'next';
import { getStoreInfo, SITE } from '@/lib/seo';
import AppShell from '@/components/AppShell';
import { JsonLdScript } from '@/components/JsonLdScript';
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from '@/lib/structured-data';
import { resolveRequestLocale } from '@/lib/serverLocale';

/**
 * Root layout — a SERVER component.
 *
 * It used to be `'use client'` and 875 lines long. That single fact caused the
 * soft-404 bug (KNOWN_GAPS.md section 7): a client root layout commits the HTML
 * shell before page rendering completes, so `notFound()` could still render
 * not-found.tsx but could no longer change the HTTP status. Unknown category
 * and product URLs returned 200, which search engines may index instead of
 * dropping.
 *
 * The interactive shell (Header, footer, cart, theme, toasts) moved verbatim
 * into components/AppShell.tsx, which is still a client component. No markup or
 * styling changed — only where the client boundary sits.
 *
 * The two store-name meta tags previously read `useStoreSettings()` at runtime,
 * which is exactly the kind of thing that forced this file to be a client
 * component. They are now produced by generateMetadata on the server, so they
 * are present in the initial HTML for crawlers rather than appearing after
 * hydration.
 */

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return {
    // No `title` or `description` here on purpose: this layout renders on
    // EVERY route, and a value set here is emitted alongside the per-page
    // metadata. Pages own their own titles via their generateMetadata.
    authors: [{ name: store.storeName }],
    openGraph: {
      siteName: store.storeName,
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
    },
    icons: {
      icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    },
  };
}

export const viewport: Viewport = {
  // No `maximumScale` and no `userScalable: false` - those block pinch-to-zoom
  // and are a WCAG 1.4.4 violation. The browser's default zoom behaviour is
  // already what we want.
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Site-wide structured data: Organization (who owns the
  // content) and WebSite with a SearchAction (lets Google
  // show a sitelinks searchbox). These run on the server so
  // they're in the initial HTML for crawlers; the client
  // shell never needs to know about them.
  const store = await getStoreInfo();
  // Resolve the visitor's chosen language on the server so the initial HTML
  // already has the right <html lang="..." dir="..."> - no flash of LTR/English
  // content before the i18n hook runs in the client. The cookie is the same
  // key the i18n hook writes (`localStorage.language`) re-purposed as a
  // cookie so server components can read it; clients keep reading localStorage
  // for backwards compat. Until the cookie is set we fall back to the
  // default-language list, which mirrors the i18n hook's "browser lang or
  // English" behaviour.
  const { code: lang, dir } = await resolveRequestLocale();
  const org = buildOrganizationJsonLd({
    name: store.storeName,
    url: SITE,
    description: store.storeDescription,
  });
  const site = buildWebSiteJsonLd({
    name: store.storeName,
    url: SITE,
    description: store.storeDescription,
  });
  return (
    <html lang={lang} dir={dir}>
      <head>
        <JsonLdScript data={[org, site]} testId="json-ld-site" />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <AppShell initialLang={lang} initialDir={dir}>{children}</AppShell>
      </body>
    </html>
  );
}
