'use client';

/**
 * /compare - side-by-side product comparison.
 *
 * Reads the selection from the CompareProvider (localStorage-backed)
 * and fetches each product by slug - the list stores stubs on purpose,
 * so the full data (live price, stock, rating, description) is loaded
 * here. Fetch failures keep the other columns: one broken product
 * shouldn't sink the comparison (it renders as a "no longer available"
 * column with a remove action).
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Product } from '@/lib/api';
import { useStoreSettings, formatPrice } from '@/lib/settings';
import { useCompare } from '@/lib/compare';
import { DirectionArrow } from '@/components/DirectionArrow';

export default function ComparePage() {
  const { items, remove, clear } = useCompare();
  const { settings } = useStoreSettings();
  const [products, setProducts] = useState<Record<string, Product | null | 'error'>>({});
  const [loading, setLoading] = useState(items.length > 0);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(
      items.map(async (item) => {
        try {
          const res = await api.getProductBySlug(item.slug);
          return [item.id, res.data] as const;
        } catch {
          return [item.id, 'error' as const] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setProducts(Object.fromEntries(entries));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div style={{ maxWidth: '720px', margin: '64px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚖️</div>
        <h1 style={{ fontSize: '26px', fontWeight: 700, margin: '0 0 12px' }}>Nothing to compare yet</h1>
        <p style={{ color: 'var(--muted, #666)', fontSize: '15px', lineHeight: 1.6 }}>
          Pick two or more products from the catalog - use the Compare box on
          product cards or the product page - and they will line up here.
        </p>
        <Link
          href="/products"
          style={{
            display: 'inline-block',
            marginTop: '24px',
            padding: '12px 24px',
            backgroundColor: 'var(--primary, #111)',
            color: 'var(--primary-text, #fff)',
            borderRadius: 'var(--button-radius, 8px)',
            fontSize: '15px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Browse the catalog
        </Link>
      </div>
    );
  }

  const rows: { label: string; render: (p: Product) => React.ReactNode }[] = [
    {
      label: 'Price',
      render: (p) => (
        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--price, #111)' }}>
          {formatPrice(p.price, settings.currencySymbol)}
        </span>
      ),
    },
    {
      label: 'Availability',
      render: (p) => (
        <span style={{ color: p.quantity > 0 ? 'var(--muted, #666)' : '#b91c1c' }}>
          {p.quantity > 0 ? `${p.quantity} in stock` : 'Out of stock'}
        </span>
      ),
    },
    {
      label: 'Rating',
      render: (p) =>
        p.reviewCount > 0 ? `★ ${p.averageRating} (${p.reviewCount})` : 'No reviews yet',
    },
    {
      label: 'Category',
      render: (p) => (
        <Link
          href={`/category/${p.category?.slug ?? 'all'}`}
          style={{ color: 'var(--accent, #2563eb)', textDecoration: 'none' }}
        >
          {p.category?.name || '—'}
        </Link>
      ),
    },
    {
      label: 'Description',
      render: (p) => (
        <span style={{ fontSize: '13px', lineHeight: 1.55, color: 'var(--muted, #666)' }}>
          {p.shortDescription ||
            (p.description ? p.description.replace(/<[^>]*>/g, ' ').slice(0, 180) : '—')}
        </span>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 'var(--container, 1200px)', margin: '0 auto', padding: '40px 20px 96px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, margin: 0 }}>
          Compare products
          <span style={{ fontSize: '16px', color: 'var(--muted, #666)', fontWeight: 400 }}>
            {' '}
            ({items.length} selected)
          </span>
        </h1>
        <button
          onClick={clear}
          style={{
            border: '1px solid var(--border, #e5e7eb)',
            background: 'none',
            color: 'var(--body-text, #111)',
            borderRadius: '999px',
            padding: '8px 16px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Clear all
        </button>
      </div>

      {loading ? (
        <p style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted, #666)' }}>
          Loading products…
        </p>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 'var(--radius, 8px)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: 'sticky',
                    insetInlineStart: 0,
                    backgroundColor: 'var(--card-bg, #fff)',
                    textAlign: 'start',
                    padding: '16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--muted, #666)',
                    width: '140px',
                    borderInlineEnd: '1px solid var(--border, #e5e7eb)',
                  }}
                >
                  &nbsp;
                </th>
                {items.map((item) => {
                  const p = products[item.id];
                  return (
                    <th
                      key={item.id}
                      style={{
                        padding: '16px',
                        textAlign: 'center',
                        verticalAlign: 'bottom',
                        borderInlineEnd: '1px solid var(--border, #e5e7eb)',
                        minWidth: '180px',
                      }}
                    >
                      {p === 'error' || p === null || p === undefined ? (
                        <div>
                          <div
                            style={{
                              width: '80px',
                              height: '80px',
                              margin: '0 auto 12px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--border, #e5e7eb)',
                            }}
                          />
                          <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>{item.name}</p>
                          <p style={{ fontSize: '12px', color: '#b91c1c', margin: '0 0 8px' }}>
                            No longer available
                          </p>
                          <button
                            onClick={() => remove(item.id)}
                            style={{
                              border: '1px solid var(--border, #e5e7eb)',
                              background: 'none',
                              borderRadius: '999px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div>
                          {p.images?.[0]?.url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.images[0].url}
                              alt={p.name}
                              width={80}
                              height={80}
                              style={{
                                margin: '0 auto 12px',
                                display: 'block',
                                objectFit: 'cover',
                                borderRadius: '50%',
                              }}
                            />
                          )}
                          <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>{p.name}</p>
                          <Link
                            href={`/products/${p.slug}`}
                            style={{
                              fontSize: '12px',
                              color: 'var(--accent, #2563eb)',
                              textDecoration: 'none',
                            }}
                          >
                            View product <DirectionArrow kind="forward" />
                          </Link>
                          <div style={{ marginTop: '8px' }}>
                            <button
                              onClick={() => remove(item.id)}
                              style={{
                                border: '1px solid var(--border, #e5e7eb)',
                                background: 'none',
                                borderRadius: '999px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                color: 'var(--muted, #666)',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={row.label}>
                  <td
                    style={{
                      position: 'sticky',
                      insetInlineStart: 0,
                      backgroundColor: 'var(--card-bg, #fff)',
                      padding: '14px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--muted, #666)',
                      borderInlineEnd: ri < rows.length - 1 ? '1px solid var(--border, #e5e7eb)' : undefined,
                      borderBottom: ri < rows.length - 1 ? '1px solid var(--border, #e5e7eb)' : undefined,
                    }}
                  >
                    {row.label}
                  </td>
                  {items.map((item) => {
                    const p = products[item.id];
                    return (
                      <td
                        key={item.id}
                        style={{
                          padding: '14px 16px',
                          textAlign: 'center',
                          fontSize: '14px',
                          borderInlineEnd: '1px solid var(--border, #e5e7eb)',
                          borderBottom: ri < rows.length - 1 ? '1px solid var(--border, #e5e7eb)' : undefined,
                        }}
                      >
                        {p && p !== 'error' ? row.render(p) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: '24px', fontSize: '13px', color: 'var(--muted, #666)' }}>
        Tip: you can select up to 4 products. Prices and availability are live -
        they refresh when the page loads.
      </p>
    </div>
  );
}
