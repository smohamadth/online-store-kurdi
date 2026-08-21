import type { Metadata } from 'next';
import { serverFetch } from './serverFetch';

/**
 * Shared helpers for server-side metadata.
 *
 * Every page previously declared SEO with next/head inside a client
 * component, which is a no-op in the App Router — none of those tags reached
 * the HTML. These helpers run on the server via generateMetadata.
 */

// getStoreInfo fetches via serverFetch (loopback fallbacks) - see lib/serverFetch.ts.
export const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export interface StoreInfo {
  storeName: string;
  storeDescription: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export async function getStoreInfo(): Promise<StoreInfo> {
  const fallback: StoreInfo = {
    storeName: 'Online Store',
    storeDescription: 'Shop the latest products at great prices.',
  };
  try {
    const res = await serverFetch('/settings', { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return fallback;
    const d = (await res.json()).data || {};
    return {
      storeName: d.storeName || fallback.storeName,
      storeDescription: d.storeDescription || fallback.storeDescription,
      metaTitle: d.metaTitle,
      metaDescription: d.metaDescription,
    };
  } catch {
    return fallback;
  }
}

/** Build a consistent Metadata object with Open Graph + Twitter populated. */
export function buildMetadata(opts: {
  title: string;
  description: string;
  path: string;
  storeName: string;
  index?: boolean;
}): Metadata {
  const url = `${SITE}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: opts.storeName,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
    },
    robots: { index: opts.index !== false, follow: true },
  };
}
