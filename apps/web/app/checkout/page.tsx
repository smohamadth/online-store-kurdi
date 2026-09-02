import type { Metadata } from 'next';
import { getStoreInfo, buildNoindexMetadata } from '@/lib/seo';
import CheckoutView from './CheckoutView';

/**
 * /checkout — server-side wrapper.
 *
 * Checkout is a real-time page (cart totals, address forms,
 * payment redirect). The interactive part is in CheckoutView;
 * this file only emits a noindex metadata block. Per Google's
 * guidelines, payment and order pages must NEVER appear in
 * search results.
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildNoindexMetadata({
    title: `Checkout — ${store.storeName}`,
    description: 'Secure checkout',
    path: '/checkout',
    storeName: store.storeName,
  });
}

export default function CheckoutPage() {
  return <CheckoutView />;
}
