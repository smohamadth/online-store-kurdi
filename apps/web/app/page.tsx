import type { Metadata } from 'next';
import { getStoreInfo, buildMetadata } from '@/lib/seo';
import HomeView from './HomeView';

/**
 * Server wrapper for the home page.
 *
 * The home page is interactive (hero slider, carousels, newsletter form) so
 * the UI stays a client component in HomeView. This thin server component
 * exists purely so generateMetadata can put real SEO tags in the HTML — the
 * previous next/head block was a no-op in the App Router and never reached
 * crawlers.
 */

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  const title = store.metaTitle?.trim() || `${store.storeName} — Shop the Best Products`;
  const description =
    store.metaDescription?.trim() ||
    store.storeDescription ||
    `Shop electronics, clothing, books and digital products at ${store.storeName}.`;

  return buildMetadata({
    title,
    description,
    path: '/',
    storeName: store.storeName,
  });
}

export default function Page() {
  return <HomeView />;
}
