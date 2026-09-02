import type { Metadata } from 'next';
import { getStoreInfo, buildMetadata } from '@/lib/seo';
import DealsView from './DealsView';

/**
 * /deals — server-side wrapper.
 *
 * The page is a client component (it fetches /products?onSale=true
 * and renders a grid). generateMetadata runs on the server so
 * the deal page shows up in search results with a real title +
 * description; without this wrapper, crawlers saw the generic
 * site title.
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildMetadata({
    title: `Deals & Sales — ${store.storeName}`,
    description: `Discounted products and limited-time offers at ${store.storeName}.`,
    path: '/deals',
    storeName: store.storeName,
  });
}

export default function DealsPage() {
  return <DealsView />;
}
