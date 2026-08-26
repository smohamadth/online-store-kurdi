import type { Metadata } from 'next';
import { getStoreInfo, buildMetadata } from '@/lib/seo';
import FaqView from './FaqView';

/**
 * /faq — server-side wrapper.
 *
 * The FAQ is a client component (accordion state). Without this
 * wrapper, crawlers would only see the generic site title. With
 * it, the FAQ gets indexed under its own title + description, which
 * is what brings in long-tail traffic ("how do I return an item?",
 * "how long does shipping take?").
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildMetadata({
    title: `FAQ — ${store.storeName}`,
    description: `Frequently asked questions about shipping, returns, accounts, and orders at ${store.storeName}.`,
    path: '/faq',
    storeName: store.storeName,
  });
}

export default function FaqPage() {
  return <FaqView />;
}
