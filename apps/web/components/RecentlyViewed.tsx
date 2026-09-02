'use client';

/**
 * "Recently viewed" row for the home page - the last products this
 * browser opened, in order. Renders nothing when the list is empty so
 * a fresh visitor never sees an empty section.
 *
 * Reuses ProductCard so the row looks like the rest of the catalog
 * (same image treatment, price formatting, add-to-cart, compare).
 */

import { useRecentlyViewed } from '@/lib/recentlyViewed';
import { useStoreSettings } from '@/lib/settings';
import type { Product } from '@/lib/api';
import ProductCard from '@/components/ProductCard';

export default function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  // The product page hides the product you are already looking at.
  const items = useRecentlyViewed().filter((i) => i.id !== excludeId);
  const { settings } = useStoreSettings();

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Recently viewed products"
      style={{
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
        padding: '64px 20px',
        borderTop: '1px solid var(--border, #e5e7eb)',
      }}
    >
      <h2 style={{ fontSize: 'clamp(20px, 2.5vw, 26px)', fontWeight: 700, margin: '0 0 24px' }}>
        Recently viewed
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '20px',
        }}
      >
        {items.map((item) => {
          // ProductCard expects the full Product shape; the stub we
          // store carries the fields it renders (price, image, stock,
          // type, rating, category). The rest are inert defaults -
          // the card links out to /products/<slug> for the full page.
          const product: Product = {
            id: item.id,
            name: item.name,
            slug: item.slug,
            description: '',
            shortDescription: null,
            sku: '',
            type: item.type ?? 'physical',
            status: 'active',
            price: item.price,
            compareAtPrice: item.compareAtPrice ?? null,
            quantity: item.quantity ?? 0,
            images: item.image
              ? [{ id: '', url: item.image, alt: item.name, isPrimary: true, sortOrder: 0 }]
              : [],
            category: item.category
              ? { id: '', name: item.category, slug: '', image: null }
              : { id: '', name: 'Shop', slug: '', image: null },
            variants: [],
            averageRating: item.averageRating ?? 0,
            reviewCount: item.reviewCount ?? 0,
            downloadUrl: null,
            downloadLimit: null,
            downloadExpiry: null,
            createdAt: '',
            updatedAt: '',
          };
          return <ProductCard key={item.id} product={product} currencySymbol={settings.currencySymbol} />;
        })}
      </div>
    </section>
  );
}
