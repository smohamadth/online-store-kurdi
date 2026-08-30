// ---------------------------------------------------------------------------
// /products - the main product listing (search box, filter sidebar,
// sort, pagination).
//
// The whole filter state lives in the URL (lib/filterParams encodes/
// decodes it), so a shopper can share or bookmark a filtered view;
// every change updates the query string and re-fetches. Facets for the
// sidebar come from GET /api/products/facets with the same filter, so
// the counts reflect what's currently selected.
// ---------------------------------------------------------------------------

'use client';

import { useState, useEffect, useMemo, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, Product, Category } from '@/lib/api';
import { useStoreSettings } from '@/lib/settings';
import ProductCard from '@/components/ProductCard';
import FilterSidebar, { type Facets } from '@/components/FilterSidebar';
import {
  encodeFilter,
  decodeFilter,
  EMPTY_FILTER,
  activeFilterCount,
  isEmptyFilter,
} from '@/lib/filterParams';
import type { ProductFilter } from '@/lib/filterParams.types';
import { API_BASE } from '@/lib/apiBase';
import { buildItemListJsonLd, buildBreadcrumbJsonLd, asGraph } from '@/lib/structured-data';
import { SITE } from '@/lib/seo';
import { getImageUrl } from '@/lib/api';

function ProductsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { settings } = useStoreSettings();

  // The filter is the single source of truth for the page. Every input
  // mutates it via setFilter; a useEffect below pushes the change to
  // the URL and refetches.
  const initialFilter = useMemo(
    () => decodeFilter(searchParams),
    // Only decode on the first render; subsequent updates come from
    // the URL pushes the page makes itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [filter, setFilter] = useState<ProductFilter>(initialFilter);

  // Push filter changes to the URL and refetch. The URL is what
  // makes the filter shareable, so it's the source of truth on
  // initial load.
  useEffect(() => {
    const params = encodeFilter(filter);
    const newUrl = params.toString() ? `?${params.toString()}` : '/products';
    if (typeof window !== 'undefined' && window.location.search !== (params.toString() ? `?${params.toString()}` : '')) {
      router.replace(newUrl, { scroll: false });
    }
    // Also surface the searchQuery field on the top of the page.
  }, [filter, router]);

  // Fetch products + facets in parallel whenever the filter changes.
  useEffect(() => {
    let alive = true;
    setLoading(true);

    const fetchProducts = async () => {
      const params = encodeFilter(filter);
      const res = await fetch(`${API_BASE}/products?${params.toString()}`);
      if (!alive) return;
      if (res.ok) {
        const json = await res.json();
        setProducts(json.data || []);
        setTotal(json.pagination?.total ?? 0);
      } else {
        setProducts([]);
        setTotal(0);
      }
    };

    const fetchFacets = async () => {
      const params = encodeFilter(filter);
      const res = await fetch(`${API_BASE}/products/facets?${params.toString()}`);
      if (!alive) return;
      if (res.ok) {
        const json = await res.json();
        setFacets(json.data || null);
      } else {
        setFacets(null);
      }
    };

    Promise.all([fetchProducts(), fetchFacets()])
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filter]);

  // Legacy support: /products?category=clothing used to be the way to
  // filter. The new contract is /products?category=clothing,foo. We
  // keep the redirect so old links still work.
  useEffect(() => {
    // No-op: the new decodeFilter handles the same query. We do keep
    // a "category" key for backward compat - decodeFilter already
    // parses it. The `/category/<slug>` route handles the path-style.
  }, [searchParams]);

  const onClear = useCallback(() => {
    setFilter(EMPTY_FILTER);
  }, []);

  const filterCount = activeFilterCount(filter);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Structured data: ItemList of the visible products + a
          BreadcrumbList. The script is rendered every render
          because the products list is client-side, but the
          payload is small and the validator is happy with
          any well-formed JSON-LD block. */}
      {products.length > 0 && (() => {
        const listUrl = `${SITE}/products${typeof window !== 'undefined' && window.location.search ? window.location.search : ''}`;
        const list = buildItemListJsonLd(
          'Products',
          products.slice(0, 50).map((p, i) => ({
            url: `${SITE}/products/${p.slug}`,
            name: p.name,
            image: p.images?.[0] ? getImageUrl(p.images[0].url) : undefined,
            position: i + 1,
          })),
          listUrl,
        );
        const breadcrumb = buildBreadcrumbJsonLd([
          { name: 'Home', url: `${SITE}/` },
          { name: 'Products', url: `${SITE}/products` },
        ]);
        return (
          <script
            type="application/ld+json"
            data-testid="json-ld-list"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(asGraph([list, breadcrumb])) }}
          />
        );
      })()}
      {/* Breadcrumb */}
      <nav
        style={{
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          color: 'var(--muted, #666)',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--muted, #666)' }}>
          Home
        </Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Products</span>
      </nav>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '16px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>Products</h1>
        <span style={{ color: 'var(--muted, #666)', fontSize: '14px' }}>
          {loading ? 'Loading…' : `${total} result${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Top toolbar: search + sort + advanced-filters toggle */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          placeholder="Search products..."
          value={filter.search || ''}
          onChange={(e) => setFilter({ ...filter, search: e.target.value || undefined })}
          aria-label="Search products"
          style={{
            flex: 1,
            minWidth: '180px',
            padding: '10px 14px',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '6px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <select
          value={filter.sort}
          onChange={(e) => setFilter({ ...filter, sort: e.target.value as ProductFilter['sort'] })}
          aria-label="Sort"
          style={{
            padding: '10px 12px',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '6px',
            fontSize: '14px',
            backgroundColor: 'var(--card-bg, #fff)',
            cursor: 'pointer',
          }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="name_asc">Name: A-Z</option>
          <option value="name_desc">Name: Z-A</option>
          <option value="rating_desc">Highest Rated</option>
          <option value="popular">Most Popular</option>
        </select>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          style={{
            padding: '10px 14px',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '6px',
            fontSize: '14px',
            backgroundColor: showAdvanced ? 'var(--brand, #111)' : 'var(--card-bg, #fff)',
            color: showAdvanced ? 'var(--brand-text, #fff)' : 'var(--body-text, #111)',
            cursor: 'pointer',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {showAdvanced ? 'Hide filters' : 'Filters'}
          {filterCount > 0 && (
            <span
              style={{
                marginInlineStart: '6px',
                backgroundColor: showAdvanced ? 'rgba(255,255,255,0.25)' : 'var(--accent, #2563eb)',
                color: '#fff',
                borderRadius: '999px',
                padding: '1px 8px',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {filterCount}
            </span>
          )}
        </button>
      </div>

      {/* Active-filter chips. Each chip is a button that, when clicked,
          removes just that dimension from the filter. */}
      {filterCount > 0 && <ActiveFilterChips filter={filter} setFilter={setFilter} />}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showAdvanced ? 'minmax(0, 1fr) 280px' : 'minmax(0, 1fr)',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        <div>
          {/* Loading State */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '64px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
              <p style={{ fontSize: '18px', color: 'var(--muted, #666)' }}>Loading products…</p>
            </div>
          )}

          {/* No Results */}
          {!loading && products.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted, #666)' }}>
              <p style={{ fontSize: '48px', marginBottom: '16px' }}>😕</p>
              <p style={{ fontSize: '18px' }}>No products found</p>
              {!isEmptyFilter(filter) && (
                <button
                  onClick={onClear}
                  style={{
                    marginTop: '16px',
                    padding: '10px 20px',
                    backgroundColor: 'var(--brand, #000)',
                    color: 'var(--brand-text, #fff)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Product Grid */}
          {!loading && products.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '16px',
              }}
            >
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  currencySymbol={settings.currencySymbol}
                />
              ))}
            </div>
          )}
        </div>

        {showAdvanced && (
          <FilterSidebar
            filter={filter}
            facets={facets}
            currencySymbol={settings.currencySymbol}
            onChange={setFilter}
            onClear={onClear}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Chip rail that shows the user's current selections and lets them
 * drop one at a time. Hidden when no filter is active.
 */
function ActiveFilterChips({
  filter,
  setFilter,
}: {
  filter: ProductFilter;
  setFilter: (f: ProductFilter) => void;
}) {
  const chips: { key: string; label: string; remove: () => void }[] = [];

  for (const c of filter.category) {
    chips.push({
      key: `cat-${c}`,
      label: `Category: ${c}`,
      remove: () => setFilter({ ...filter, category: filter.category.filter((x) => x !== c) }),
    });
  }
  for (const t of filter.type) {
    chips.push({
      key: `type-${t}`,
      label: `Type: ${t}`,
      remove: () => setFilter({ ...filter, type: filter.type.filter((x) => x !== t) }),
    });
  }
  for (const [k, vs] of Object.entries(filter.attr)) {
    for (const v of vs) {
      chips.push({
        key: `attr-${k}-${v}`,
        label: `${k}: ${v}`,
        remove: () => {
          const next = { ...filter.attr };
          next[k] = (next[k] || []).filter((x) => x !== v);
          if (next[k].length === 0) delete next[k];
          setFilter({ ...filter, attr: next });
        },
      });
    }
  }
  if (filter.inStock) {
    chips.push({ key: 'instock', label: 'In stock only', remove: () => setFilter({ ...filter, inStock: false }) });
  }
  if (filter.onSale) {
    chips.push({ key: 'onsale', label: 'On sale', remove: () => setFilter({ ...filter, onSale: false }) });
  }
  if (filter.minRating !== undefined) {
    chips.push({
      key: 'rating',
      label: `Rating ${filter.minRating}+`,
      remove: () => setFilter({ ...filter, minRating: undefined }),
    });
  }
  if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
    const lo = filter.minPrice ?? '0';
    const hi = filter.maxPrice ?? '∞';
    chips.push({
      key: 'price',
      label: `Price: ${lo}–${hi}`,
      remove: () => setFilter({ ...filter, minPrice: undefined, maxPrice: undefined }),
    });
  }
  if (filter.search) {
    chips.push({ key: 'search', label: `Search: "${filter.search}"`, remove: () => setFilter({ ...filter, search: undefined }) });
  }
  if (filter.sort && filter.sort !== 'newest') {
    chips.push({ key: 'sort', label: `Sort: ${filter.sort}`, remove: () => setFilter({ ...filter, sort: 'newest' }) });
  }

  if (chips.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        marginBottom: '16px',
      }}
    >
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          aria-label={`Remove filter ${c.label}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            fontSize: '12px',
            backgroundColor: 'var(--surface-2, #f5f5f5)',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '999px',
            color: 'var(--body-text, #111)',
            cursor: 'pointer',
          }}
        >
          <span>{c.label}</span>
          <span aria-hidden="true" style={{ fontWeight: 700 }}>×</span>
        </button>
      ))}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ textAlign: 'center', padding: '64px' }}>
          <p style={{ color: 'var(--muted, #666)' }}>Loading products…</p>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
