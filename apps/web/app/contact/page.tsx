import type { Metadata } from 'next';
import { getStoreInfo, buildMetadata } from '@/lib/seo';
import ContactView from './ContactView';

/**
 * /contact — server-side wrapper.
 *
 * The contact form is a client component. generateMetadata runs
 * on the server so the contact page has a real title + description
 * in search results; the previous (no-metadata) state had crawlers
 * reading the generic site title for this URL.
 */
export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreInfo();
  return buildMetadata({
    title: `Contact — ${store.storeName}`,
    description: store.storeEmail
      ? `Get in touch with ${store.storeName}. Email ${store.storeEmail} or use the contact form.`
      : `Get in touch with ${store.storeName}.`,
    path: '/contact',
    storeName: store.storeName,
  });
}

export default function ContactPage() {
  return <ContactView />;
}
