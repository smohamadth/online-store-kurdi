import type { Metadata } from 'next';
import { getStoreInfo, buildNoindexMetadata } from '@/lib/seo';
import ForgotPasswordView from './ForgotPasswordView';

/**
 * /forgot-password — server-side wrapper.
 *
 * Same pattern as /login: the form is a client component, this
 * file just emits a noindex metadata block. Password reset
 * URLs end up in logs and inboxes; we don't want them in
 * search results.
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildNoindexMetadata({
    title: `Reset password — ${store.storeName}`,
    description: 'Reset your account password.',
    path: '/forgot-password',
    storeName: store.storeName,
  });
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
