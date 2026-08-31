'use client';

/**
 * /admin/variants - first-class variant dashboard.
 *
 * Lists every variant across the catalogue with filter chips for
 * product, status, in-stock, price range, and search. The detail
 * edit (price, SKU, slug, attributes) is still per-product at
 * /admin/products/[id]/variants; this page is the catalogue view
 * the previous "you have to walk every product" workflow.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/lib/hooks';
import { LoadingState } from '@/components/Spinner';
import { API_BASE } from '@/lib/http';

interface VariantRow {
  id: string;
  productId: string;
  name: string;
  sku: string;
  slug: string | null;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  isActive: boolean;
  attributes: Record<string, unknown>;
}

interface ProductChip {
  id: string;
  name: string;
}

const CURRENCY_SYMBOL = '$';

function formatPrice(n: number) {
  return `${CURRENCY_SYMBOL}${n.toFixed(2)}`;
}

export default function AdminVariantsPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [products, setProducts] = useState<ProductChip[]>([]);
  const [err, setErr] = useState('');

  const [productId, setProductId] = useState<string>('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [inStock, setInStock] = useState<'' | 'true' | 'false'>('');
  const [search, setSearch] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/products?take=200`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const items = (d?.data?.items || d?.data || []) as any[];
        setProducts(items.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => { /* filter chip is optional */ });
  }, []);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const token = localStorage.getItem('token');
      const qs = new URLSearchParams();
      if (productId) qs.set('productId', productId);
      if (isActive) qs.set('isActive', isActive);
      if (inStock) qs.set('inStock', inStock);
      if (search) qs.set('search', search);
      qs.set('take', '200');
      const res = await fetch(`${API_BASE}/variants?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Could not load variants (HTTP ${res.status}).`);
      const d = await res.json();
      setVariants((d.data || []) as VariantRow[]);
    } catch (e: any) {
      setErr(e.message || 'Failed to load variants.');
      setVariants([]);
    } finally {
      setLoading(false);
    }
  }, [productId, isActive, inStock, search]);

  useEffect(() => { loadVariants(); }, [loadVariants]);

  const productName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.id, p.name);
    return (id: string) => m.get(id) || id.slice(0, 8);
  }, [products]);

  async function toggleActive(v: VariantRow) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/variants/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: !v.isActive }),
    });
    if (res.ok) {
      setVariants((vs) => vs.map((x) => x.id === v.id ? { ...x, isActive: !x.isActive } : x));
    } else {
      alert('Could not update variant.');
    }
  }

  async function deleteVariant(v: VariantRow) {
    if (!confirm(`Soft-delete variant "${v.name}" (SKU ${v.sku})? It will be hidden from the storefront.`)) return;
    setDeletingId(v.id);
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/variants/${v.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setDeletingId(null);
    if (res.ok) {
      setVariants((vs) => vs.map((x) => x.id === v.id ? { ...x, isActive: false, quantity: 0 } : x));
    } else {
      alert('Could not delete variant.');
    }
  }

  const stats = useMemo(() => {
    const out = { total: variants.length, active: 0, inStock: 0, outOfStock: 0, lowStock: 0 };
    for (const v of variants) {
      if (v.isActive) out.active++;
      if (v.quantity > 0) out.inStock++;
      else out.outOfStock++;
      if (v.quantity > 0 && v.quantity <= 5) out.lowStock++;
    }
    return out;
  }, [variants]);

  if (loading && variants.length === 0) {
    return <LoadingState message="Loading variants…" minHeight={400} />;
  }

  const cell: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e5e5)', fontSize: '14px' };
  const headerCell: React.CSSProperties = { ...cell, fontWeight: 700, background: 'var(--surface-2, #f7f7f7)', textAlign: 'left' as const };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700 }}>Variants</h1>
          <p style={{ color: 'var(--muted, #666)', marginTop: '4px', fontSize: '14px' }}>
            Every sellable SKU across the catalogue. Click a row to edit it on the product page.
          </p>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', background: 'var(--danger-bg, #fee2e2)', color: 'var(--danger-text, #991b1b)', fontSize: '14px' }}>
          {err}
        </div>
      )}

      <div style={{
        marginTop: '20px',
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
        gap: '10px',
      }}>
        {[
          { label: 'Total', value: stats.total },
          { label: 'Active', value: stats.active },
          { label: 'In stock', value: stats.inStock },
          { label: 'Out of stock', value: stats.outOfStock },
          { label: 'Low stock (≤5)', value: stats.lowStock },
        ].map((s) => (
          <div key={s.label} style={{ padding: '12px 16px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '8px', background: 'var(--card-bg, #fff)' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted, #666)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: '18px',
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Product</label>
          <select
            data-testid="filter-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border, #d4d4d4)', fontSize: '14px', minWidth: '180px' }}
          >
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Status</label>
          <select
            data-testid="filter-status"
            value={isActive}
            onChange={(e) => setIsActive(e.target.value as any)}
            style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border, #d4d4d4)', fontSize: '14px' }}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Stock</label>
          <select
            data-testid="filter-stock"
            value={inStock}
            onChange={(e) => setInStock(e.target.value as any)}
            style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border, #d4d4d4)', fontSize: '14px' }}
          >
            <option value="">All</option>
            <option value="true">In stock</option>
            <option value="false">Out of stock</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Search</label>
          <input
            data-testid="filter-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or SKU…"
            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border, #d4d4d4)', fontSize: '14px' }}
          />
        </div>
      </div>

      <div style={{ marginTop: '18px', border: '1px solid var(--border, #e5e5e5)', borderRadius: '10px', overflowX: 'auto', background: 'var(--card-bg, #fff)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="variants-table">
          <thead>
            <tr>
              <th style={headerCell}>Variant</th>
              {!isMobile && <th style={headerCell}>Product</th>}
              <th style={headerCell}>SKU</th>
              {!isMobile && <th style={headerCell}>Slug</th>}
              <th style={{ ...headerCell, textAlign: 'right' }}>Price</th>
              <th style={{ ...headerCell, textAlign: 'right' }}>Qty</th>
              <th style={headerCell}>Status</th>
              <th style={headerCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {variants.length === 0 && !loading && (
              <tr>
                <td colSpan={isMobile ? 6 : 8} style={{ ...cell, textAlign: 'center', color: 'var(--muted, #666)' }}>
                  No variants match your filters.
                </td>
              </tr>
            )}
            {variants.map((v) => (
              <tr key={v.id} data-testid={`variant-row-${v.id}`}>
                <td style={cell}>
                  <strong>{v.name}</strong>
                  {!isMobile && Object.keys(v.attributes || {}).length > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--muted, #666)', marginTop: '2px' }}>
                      {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' · ')}
                    </div>
                  )}
                </td>
                {!isMobile && <td style={cell}>{productName(v.productId)}</td>}
                <td style={{ ...cell, fontFamily: 'monospace' }}>{v.sku}</td>
                {!isMobile && <td style={{ ...cell, fontFamily: 'monospace', color: 'var(--muted, #666)' }}>{v.slug || '—'}</td>}
                <td style={{ ...cell, textAlign: 'right' }}>
                  {v.compareAtPrice ? (
                    <>
                      <span style={{ color: 'var(--muted, #999)', textDecoration: 'line-through', marginRight: '6px', fontSize: '12px' }}>
                        {formatPrice(v.compareAtPrice)}
                      </span>
                      <strong style={{ color: 'var(--sale, #dc2626)' }}>{formatPrice(v.price)}</strong>
                    </>
                  ) : (
                    <strong>{formatPrice(v.price)}</strong>
                  )}
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {v.quantity === 0 ? (
                    <span style={{ color: 'var(--danger-text, #991b1b)', fontWeight: 600 }}>0</span>
                  ) : v.quantity <= 5 ? (
                    <span style={{ color: 'var(--warning-text, #92400e)', fontWeight: 600 }}>{v.quantity}</span>
                  ) : (
                    <span>{v.quantity}</span>
                  )}
                </td>
                <td style={cell}>
                  <span
                    data-testid={`variant-status-${v.id}`}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: v.isActive ? 'var(--success-bg, #dcfce7)' : 'var(--surface-2, #f5f5f5)',
                      color: v.isActive ? 'var(--success-text, #166534)' : 'var(--muted, #666)',
                    }}
                  >
                    {v.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={cell}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => router.push(`/admin/products/${v.productId}/variants`)}
                      style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border, #d4d4d4)', background: 'var(--card-bg, #fff)', cursor: 'pointer', fontSize: '13px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(v)}
                      data-testid={`toggle-${v.id}`}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border, #d4d4d4)',
                        background: 'var(--card-bg, #fff)',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      {v.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => deleteVariant(v)}
                      disabled={deletingId === v.id}
                      data-testid={`delete-${v.id}`}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--danger-border, #fecaca)',
                        color: 'var(--danger-text, #991b1b)',
                        background: 'var(--card-bg, #fff)',
                        cursor: deletingId === v.id ? 'wait' : 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      {deletingId === v.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
