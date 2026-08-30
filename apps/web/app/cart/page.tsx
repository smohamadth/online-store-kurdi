import type { Metadata } from 'next';
import { getStoreInfo, buildNoindexMetadata } from '@/lib/seo';
import CartView from './CartView';

/**
 * /cart — server-side wrapper.
 *
 * The cart page is a 'use client' component (it needs the cart
 * hook + localStorage for the applied-coupon handoff to
 * /checkout). generateMetadata can't run on a client component,
 * so the page itself is the smallest possible server component
 * that calls buildNoindexMetadata, then renders the interactive
 * view.
 *
 * Cart is noindex. Crawlers must not index individual carts -
 * the URL has a real value as a deep-link ("send your cart to
 * support") but no value in search results.
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildNoindexMetadata({
    title: `Cart — ${store.storeName}`,
    description: 'Your shopping cart',
    path: '/cart',
    storeName: store.storeName,
  });
}

export default function CartPage() {
  return <CartView />;
}
