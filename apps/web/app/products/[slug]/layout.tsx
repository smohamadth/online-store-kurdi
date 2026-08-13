import type { Metadata } from 'next';

/**
 * Server-side SEO for product pages.
 *
 * page.tsx is a client component using next/head, which is a NO-OP in the App
 * Router — verified against the served HTML, where every product returned the
 * generic site title and description. Crawlers therefore saw identical
 * metadata for the entire catalogue. generateMetadata runs on the server and
 * puts the real tags in the initial HTML.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function absolute(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${API_URL.replace('/api', '')}${url}`;
}

async function getProduct(slug: string) {
  try {
    const res = await fetch(`${API_URL}/products/slug/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

async function getStoreName(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/settings`, { next: { revalidate: 300 } });
    if (!res.ok) return 'Online Store';
    const json = await res.json();
    return json.data?.storeName || 'Online Store';
  } catch {
    return 'Online Store';
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [product, storeName] = await Promise.all([getProduct(params.slug), getStoreName()]);

  if (!product) {
    return {
      title: 'Product not found',
      robots: { index: false, follow: true },
    };
  }

  // Admin-authored values win; otherwise derive something sensible so a
  // product is never published with empty metadata.
  const title: string = product.metaTitle?.trim() || `${product.name} | ${storeName}`;

  const rawDesc =
    product.metaDescription?.trim() ||
    stripHtml(product.shortDescription || product.description || '');
  const description = rawDesc.length > 160 ? `${rawDesc.slice(0, 157)}…` : rawDesc;

  let keywords: string[] = [];
  try {
    const k = product.metaKeywords;
    keywords = Array.isArray(k) ? k : k ? JSON.parse(k) : [];
  } catch {
    keywords = [];
  }

  const image = absolute(
    product.images?.find((i: any) => i.isPrimary)?.url || product.images?.[0]?.url
  );
  const url = `${SITE}/products/${product.slug}`;
  const inStock = (product.quantity ?? 0) > 0;

  return {
    title,
    description,
    keywords: keywords.length ? keywords : undefined,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: storeName,
      type: 'website',
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
    robots: {
      // Draft/archived products must not be indexed.
      index: product.status === 'active',
      follow: true,
    },
    other: {
      'product:price:amount': String(product.price ?? ''),
      'product:availability': inStock ? 'in stock' : 'out of stock',
    },
  };
}

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
