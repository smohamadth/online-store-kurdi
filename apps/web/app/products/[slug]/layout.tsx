import type { Metadata } from 'next';
import { encodeRouteParam } from '@/lib/routeParam';
import { absoluteImageUrl, getStoreInfo, buildMetadata } from '@/lib/seo';

/**
 * Server-side SEO for product pages.
 *
 * page.tsx is a client component using next/head, which is a NO-OP in the App
 * Router — verified against the served HTML, where every product returned the
 * generic site title and description. Crawlers therefore saw identical
 * metadata for the entire catalogue. generateMetadata runs on the server and
 * puts the real tags in the initial HTML.
 *
 * Product-specific fields beyond what buildMetadata handles
 * (product:price:amount, product:availability) are kept in the
 * `other` block — Facebook's Open Graph price extension still
 * reads them for product rich previews.
 */

// Declared locally: this is a server component and lib/http.ts is
// client-only ('use client'), so it cannot be imported here.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getProduct(slug: string) {
  try {
    const res = await fetch(`${API_URL}/products/slug/${encodeRouteParam(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [product, store] = await Promise.all([getProduct(params.slug), getStoreInfo()]);

  if (!product) {
    return {
      title: 'Product not found',
      robots: { index: false, follow: true },
    };
  }

  // Admin-authored values win; otherwise derive something sensible so a
  // product is never published with empty metadata.
  const title: string = product.metaTitle?.trim() || `${product.name} | ${store.storeName}`;

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

  const image = absoluteImageUrl(
    product.images?.find((i: any) => i.isPrimary)?.url || product.images?.[0]?.url,
  );
  const inStock = (product.quantity ?? 0) > 0;
  // Draft / archived products must not be indexed. The page
  // still renders (so admins can preview) but crawlers see a
  // noindex header.
  const isActive = product.status === 'active';

  const base = buildMetadata({
    title,
    description,
    path: `/products/${product.slug}`,
    storeName: store.storeName,
    image,
    ogType: 'product',
    index: isActive,
    follow: true,
  });

  // Layer the product-specific extras on top of the standard
  // metadata. Keeping the `other` keys is what makes
  // product:price:amount show up in the Facebook / Pinterest
  // rich previews.
  return {
    ...base,
    keywords: keywords.length ? keywords : undefined,
    other: {
      'product:price:amount': String(product.price ?? ''),
      'product:availability': inStock ? 'in stock' : 'out of stock',
    },
  };
}

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
