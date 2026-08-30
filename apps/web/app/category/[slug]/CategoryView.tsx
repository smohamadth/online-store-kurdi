// ---------------------------------------------------------------------------
// /category/[slug] - the category listing page (filter sidebar + grid).
//
// Everything the user can do (filter, sort, page) is URL state, so the
// page is shareable and back-navigable - see setParam below. The sort
// values must stay in lockstep with the API's sort enum (a mismatch is
// a 400 from Zod). Structured data (ItemList + BreadcrumbList) is
// emitted inline for the visible page of products.
//
// Data: GET /api/categories/:id for the header, GET /api/products with
// the category + page/sort params for the grid.
// ---------------------------------------------------------------------------
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, Product, Category, getImageUrl } from '@/lib/api';
import { useStoreSettings } from '@/lib/settings';
import { useIsMobile } from '@/lib/hooks';
import { SITE } from '@/lib/seo';
import { buildItemListJsonLd, buildBreadcrumbJsonLd, asGraph } from '@/lib/structured-data';
import ProductCard from '@/components/ProductCard';
import { ProductGridSkeleton } from '@/components/SkeletonLoader';
import { API_BASE } from '@/lib/http';
import { encodeRouteParam } from '@/lib/routeParam';

// These values must match the API's sort enum exactly
// (price_asc | price_desc | name_asc | name_desc | newest | popular),
// otherwise the request fails Zod validation with a 400.
const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most reviewed' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
];

const PAGE_SIZE = 12;

export default function CategoryView({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const { settings } = useStoreSettings();

  const [category, setCategory] = useState<any>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const sort = searchParams.get('sort') || 'newest';

  // Keep filter state in the URL so the page is shareable, bookmarkable and
  // survives a reload / back button. The old /category/ page held
  // this in React state only, so the URL never changed when you filtered.
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === '' || value === 'newest') next.delete(key);
      else next.set(key, value);
      if (key !== 'page') next.delete('page'); // changing sort resets paging
      const qs = next.toString();
      router.push(qs ? `/category/${slug}?${qs}` : `/category/${slug}`, { scroll: false });
    },
    [router, searchParams, slug]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {

        // Existence is verified by the server component in page.tsx, which
        // returns a real HTTP 404 for unknown slugs. This fetch only needs the
        // display data.
        const catRes = await fetch(`${API_BASE}/categories/${encodeRouteParam(slug)}`);
        const catJson = await catRes.json();
        if (!cancelled) setCategory(catJson.data);

        // Filtering happens on the SERVER. The previous page pulled the first
        // 100 products and filtered in the browser, so any store with more
        // than 100 products silently dropped items from category pages.
        const res = await api.getProducts({
          category: slug,
          limit: PAGE_SIZE,
          page,
          sort: sort === 'newest' ? undefined : sort,
        } as any);

        if (!cancelled) {
          setProducts(res.data || []);
          setTotal(res.pagination?.total ?? (res.data || []).length);
        }
      } catch (err) {
        console.error('Failed to load category:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, page, sort]);

  useEffect(() => {
    api
      .getCategories()
      .then((r) => setAllCategories(r.data || []))
      .catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const title = category?.name || slug.replace(/-/g, ' ');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px 64px' }}>
      {/* Structured data: ItemList of the visible products + the
          category breadcrumb (same pattern as /products). */}
      {products.length > 0 && (
        <script
          type="application/ld+json"
          data-testid="json-ld-category"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              asGraph([
                buildItemListJsonLd(
                  title,
                  products.slice(0, 50).map((p, i) => ({
                    url: `${SITE}/products/${p.slug}`,
                    name: p.name,
                    image: p.images?.[0] ? getImageUrl(p.images[0].url) : undefined,
                    position: i + 1,
                  })),
                  `${SITE}/category/${slug}`,
                ),
                buildBreadcrumbJsonLd([
                  { name: 'Home', url: `${SITE}/` },
                  { name: 'Products', url: `${SITE}/products` },
                  { name: title, url: `${SITE}/category/${slug}` },
                ]),
              ]),
            ),
          }}
        />
      )}
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" style={{ marginBottom: '20px', fontSize: '14px', color: 'var(--muted, #666)' }}>
        <Link href="/" style={{ color: 'var(--muted, #666)', textDecoration: 'none' }}>
          Home
        </Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <Link href="/products" style={{ color: 'var(--muted, #666)', textDecoration: 'none' }}>
          Products
        </Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span style={{ color: '#111', fontWeight: 500, textTransform: 'capitalize' }}>{title}</span>
      </nav>

      {/* Category header */}
      <header
        style={{
          borderRadius: '14px',
          overflow: 'hidden',
          marginBottom: '28px',
          background: category?.image
            ? `linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.25)), url(${getImageUrl(
                category.image
              )}) center/cover no-repeat`
            : 'linear-gradient(120deg,#1a1a2e,#16213e)',
          color: '#fff',
          padding: isMobile ? '28px 22px' : '44px 40px',
        }}
      >
        <h1 style={{ fontSize: isMobile ? '26px' : '38px', fontWeight: 800, textTransform: 'capitalize' }}>
          {title}
        </h1>
        {category?.description && (
          <p style={{ marginTop: '10px', maxWidth: '620px', opacity: 0.9, lineHeight: 1.6 }}>
            {category.description}
          </p>
        )}
        <p style={{ marginTop: '10px', fontSize: '14px', opacity: 0.85 }}>
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      {/* Sibling categories */}
      {allCategories.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '20px' }}>
          <Link href="/products" style={pill(false)}>
            All
          </Link>
          {allCategories.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} style={pill(c.slug === slug)}>
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {/* Sort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        <label htmlFor="sort" style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>
          Sort by:
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => setParam('sort', e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e0e0e0',
            fontSize: '14px',
            backgroundColor: 'var(--card-bg, #fff)',
          }}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <ProductGridSkeleton count={8} />
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', border: '1px dashed #e0e0e0', borderRadius: '12px' }}>
          <div style={{ fontSize: '40px' }}>🛍️</div>
          <h2 style={{ marginTop: '12px', fontWeight: 700 }}>Nothing here yet</h2>
          <p style={{ color: 'var(--muted, #666)', marginTop: '6px', fontSize: '14px' }}>
            This category has no products at the moment.
          </p>
          <Link
            href="/products"
            style={{
              display: 'inline-block',
              marginTop: '18px',
              padding: '11px 22px',
              backgroundColor: 'var(--brand, #111)',
              color: 'var(--brand-text, #fff)',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            Browse all products
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: '20px',
          }}
        >
          {products.map((p) => (
            <ProductCard key={p.id} product={p} currencySymbol={settings.currencySymbol} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <nav
          aria-label="Pagination"
          style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '40px', flexWrap: 'wrap' }}
        >
          <button onClick={() => setParam('page', String(page - 1))} disabled={page <= 1} style={pageBtn(page <= 1)}>
            ‹ Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setParam('page', String(n))}
              style={{
                ...pageBtn(false),
                backgroundColor: n === page ? '#111' : '#fff',
                color: n === page ? '#fff' : '#111',
                fontWeight: n === page ? 700 : 500,
              }}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setParam('page', String(page + 1))}
            disabled={page >= totalPages}
            style={pageBtn(page >= totalPages)}
          >
            Next ›
          </button>
        </nav>
      )}
    </div>
  );
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: '999px',
    fontSize: '14px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    flexShrink: 0,
    border: active ? '1px solid #111' : '1px solid #e5e5e5',
    backgroundColor: active ? '#111' : '#fff',
    color: active ? '#fff' : '#111',
  };
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '9px 15px',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    backgroundColor: 'var(--card-bg, #fff)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontSize: '14px',
  };
}
