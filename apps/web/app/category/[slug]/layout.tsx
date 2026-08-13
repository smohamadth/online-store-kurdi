import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * Server-side wrapper for category pages.
 *
 * Two jobs:
 *  1. Real per-category SEO metadata. page.tsx is a client component, so it
 *     could not emit meta tags at all — every category shared the generic
 *     site title.
 *  2. A REAL 404. page.tsx calls notFound() from the client, which renders
 *     not-found.tsx but leaves the HTTP status at 200. Search engines treat
 *     that as a "soft 404" and may index the empty page. Checking on the
 *     server lets Next return a genuine 404 status.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function getCategory(slug: string) {
  try {
    const res = await fetch(`${API_URL}/categories/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    // API unreachable: don't 404 a valid category just because the backend
    // blipped — let the client page render and retry.
    return undefined;
  }
}

async function getStoreName(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/settings`, { next: { revalidate: 300 } });
    if (!res.ok) return 'Online Store';
    return (await res.json()).data?.storeName || 'Online Store';
  } catch {
    return 'Online Store';
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [category, storeName] = await Promise.all([getCategory(params.slug), getStoreName()]);

  if (!category) {
    return { title: 'Category not found', robots: { index: false, follow: true } };
  }

  const count = category._count?.products ?? 0;
  const title = `${category.name} | ${storeName}`;
  const description =
    category.description?.trim() ||
    `Browse ${count} ${count === 1 ? 'product' : 'products'} in ${category.name} at ${storeName}.`;
  const url = `${SITE}/category/${category.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: storeName, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const category = await getCategory(params.slug);

  // `null` = the API answered and the category genuinely does not exist.
  // `undefined` = the API was unreachable; fall through rather than 404.
  if (category === null) notFound();

  return <>{children}</>;
}
