import type { Metadata } from 'next';
import { getStoreInfo, buildMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildMetadata({
    title: `All Products | ${store.storeName}`,
    description: `Browse the full catalogue at ${store.storeName}. ${store.storeDescription}`.trim(),
    path: '/products',
    storeName: store.storeName,
  });
}

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
