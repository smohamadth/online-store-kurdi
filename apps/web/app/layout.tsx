import './globals.css';
import type { Metadata, Viewport } from 'next';
import { getStoreInfo } from '@/lib/seo';
import AppShell from '@/components/AppShell';

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
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
