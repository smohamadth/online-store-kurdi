import type { Metadata } from 'next';
import { getStoreInfo, buildNoindexMetadata } from '@/lib/seo';
import AccountShell from './AccountShell';

/**
 * /account — server-side layout.
 *
 * Marks every page in the /account/* tree (orders, profile,
 * wishlist, addresses, reviews, wallet) as noindex in one place.
 * The interactive sidebar / redirect-on-no-token logic lives in
 * AccountShell (a client component).
 *
 * Why a noindex is mandatory: account URLs are user-specific. If
 * a customer shares a link to /account/orders/abc-123, we don't
 * want a search engine to crawl it and add the order details to
 * its index.
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildNoindexMetadata({
    title: `My Account — ${store.storeName}`,
    description: `Manage your orders, wishlist, and account settings.`,
    path: '/account',
    storeName: store.storeName,
  });
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
