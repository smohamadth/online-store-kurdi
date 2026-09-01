import type { Metadata } from 'next';
import { getStoreInfo, buildNoindexMetadata } from '@/lib/seo';
import LoginView from './LoginView';

/**
 * /login — server-side wrapper.
 *
 * Same shape as the cart / checkout pages: the interactive
 * form is a client component (LoginView); this file just
 * emits a noindex metadata block. Search engines must never
 * index an authentication page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildNoindexMetadata({
    title: `Sign in — ${store.storeName}`,
    description: `Sign in to your ${store.storeName} account`,
    path: '/login',
    storeName: store.storeName,
  });
}

export default function LoginPage() {
  return <LoginView />;
}
