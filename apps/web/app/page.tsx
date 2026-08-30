import type { Metadata } from 'next';
import { getStoreInfo, buildMetadata, SITE } from '@/lib/seo';
import HomeView from './HomeView';
import { JsonLdScript } from '@/components/JsonLdScript';
import { buildWebSiteJsonLd } from '@/lib/structured-data';

/**
 * Server wrapper for the home page.
 *
 * The home page is interactive (hero slider, carousels, newsletter form) so
 * the UI stays a client component in HomeView. This thin server component
 * exists purely so generateMetadata can put real SEO tags in the HTML — the
 * previous next/head block was a no-op in the App Router and never reached
 * crawlers.
 *
 * The WebSite JSON-LD is repeated here (and in the root layout) because the
 * root layout's <head> only renders once per response, and pages can
 * explicitly own their own structured-data to override or extend it.
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

export default async function Page() {
  const store = await getStoreInfo();
  const site = buildWebSiteJsonLd({
    name: store.storeName,
    url: SITE,
    description: store.storeDescription,
  });
  return (
    <>
      <JsonLdScript data={site} testId="json-ld-home" />
      <HomeView />
    </>
  );
}
