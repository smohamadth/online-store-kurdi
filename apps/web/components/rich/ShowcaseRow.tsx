// Category showcase — a rich prebuilt home block (type "showcaseRow").
//
// A product row pinned to ONE category ("shop this range"): it fetches
// the category's products itself (same data the /products listing uses)
// and renders the standard ProductCard grid with a view-all link to the
// category page. Hides itself until the admin picks a category.

'use client';

import { useEffect, useState } from 'react';
import { api, type Product } from '@/lib/api';
import { useIsMobile } from '@/lib/hooks';
import ProductCard from '@/components/ProductCard';
import { ProductGridSkeleton } from '@/components/SkeletonLoader';
import { SectionHeading } from '@/components/HomeSections';

interface Props {
  title?: string | null;
  subtitle?: string | null;
  /** Category slug; empty hides the row. */
  category?: string;
  limit?: number;
  viewAllText?: string;
  currencySymbol?: string;
}

export default function ShowcaseRow({
  title,
  subtitle,
  category,
  limit = 8,
  viewAllText,
  currencySymbol = '$',
}: Props) {
  const isMobile = useIsMobile();
  const slug = (category || '').trim();
  const wanted = Math.max(4, Math.min(12, Number(limit) || 8));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (!slug) {
      setProducts([]);
      setLoadedOnce(false);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .getProducts({ category: slug, limit: wanted, sort: 'popular' })
      .then((r) => {
        if (!alive) return;
        setProducts((r.data || []).slice(0, wanted));
      })
      .catch(() => alive && setProducts([]))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setLoadedOnce(true);
      });
    return () => {
      alive = false;
    };
  }, [slug, limit]);

  if (!slug) return null;
  const href = `/category/${encodeURIComponent(slug)}`;

  return (
    <section
      data-section="showcase"
      style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto', padding: '64px 20px' }}
    >
      <SectionHeading
        title={title}
        subtitle={subtitle}
        linkText={viewAllText || `View all →`}
        linkHref={href}
      />
      {loading && (
        <div style={{ marginTop: '32px' }}>
          <ProductGridSkeleton count={wanted} />
        </div>
      )}
      {!loading && products.length > 0 && (
        <div
          style={{
            marginTop: '32px',
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: '24px',
          }}
        >
          {products.map((p) => (
            <ProductCard key={p.id} product={p} currencySymbol={currencySymbol} />
          ))}
        </div>
      )}
      {!loading && loadedOnce && products.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted, #6b7280)' }}>
          <p>No products in this category yet.</p>
          <p style={{ fontSize: '13.5px', marginTop: '6px' }}>
            Add products to <strong>{slug}</strong> or pick another category in the block settings.
          </p>
        </div>
      )}
    </section>
  );
}
