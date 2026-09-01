// ---------------------------------------------------------------------------
// /admin/products/[id]/variants - the per-product variant editor
// (list + add/edit form).
//
// Variant attributes are edited as raw "key=value" lines in the form and
// parsed to a JSON object on submit (the API stores them as a
// JSON-string column). Writes go through the product-nested variant
// routes (/api/products/:id/variants - the live implementation).
// ---------------------------------------------------------------------------
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { authHttp, errorMessage } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

interface Variant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  attributes: Record<string, string>;
  isActive: boolean;
}

interface VariantForm {
  name: string;
  sku: string;
  price: string;
  quantity: string;
  attributesText: string; // raw "key=value" lines, parsed on submit
  isActive: boolean;
}

const EMPTY_FORM: VariantForm = {
  name: '',
  sku: '',
  price: '0',
  quantity: '0',
  attributesText: '',
  isActive: true,
};

/**
 * Convert the form's "k=v" text into a JSON object the API
 * accepts. Empty lines and `=` with no value are ignored. We do
 * the parse on submit rather than on every keystroke so a user
 * mid-typing doesn't see an error message they have to dismiss.
 */
function parseAttributesText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

function formatAttributes(attrs: Record<string, string>): string {
  return Object.entries(attrs).map(([k, v]) => `${k}=${v}`).join('\n');
}

export default function ProductVariantsPage() {
  const params = useParams();
  const productId = params?.id as string;
  // The variant form has a 1fr/1fr row (name/sku). Stack under 640px.
  const isMobile = useIsMobile(640);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VariantForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVariants = useCallback(async () => {
    try {
      const res = await authHttp.get<Variant[]>(`/products/${productId}/variants`);
      setVariants(res.data || []);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load variants.'));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { fetchVariants(); }, [fetchVariants]);

  const startEdit = (v: Variant) => {
    setEditingId(v.id);
    setShowForm(true);
    setForm({
      name: v.name,
      sku: v.sku,
      price: String(v.price),
      quantity: String(v.quantity),
      attributesText: formatAttributes(v.attributes || {}),
      isActive: v.isActive,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    const price = Number(form.price);
    const quantity = Number(form.quantity);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Price must be a positive number.');
      setSaving(false);
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError('Quantity must be a non-negative integer.');
      setSaving(false);
      return;
    }
    if (!form.name.trim() || !form.sku.trim()) {
      setError('Name and SKU are required.');
      setSaving(false);
      return;
    }
    const body = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      price,
      quantity,
      attributes: parseAttributesText(form.attributesText),
      isActive: form.isActive,
    };
    try {
      if (editingId) {
        await authHttp.patch(`/products/${productId}/variants/${editingId}`, body);
      } else {
        await authHttp.post(`/products/${productId}/variants`, body);
      }
      resetForm();
      await fetchVariants();
    } catch (err) {
      setError(errorMessage(err, 'Could not save variant.'));
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async (v: Variant) => {
    if (!confirm(`Deactivate "${v.name}"? It will remain in the DB but be hidden from the storefront.`)) return;
    try {
      await authHttp.delete(`/products/${productId}/variants/${v.id}`);
      await fetchVariants();
    } catch (err) {
      alert(errorMessage(err, 'Could not deactivate variant.'));
    }
  };

  const forceDelete = async (v: Variant) => {
    if (!confirm(`PERMANENTLY delete "${v.name}"? This cannot be undone. Use only for test fixtures with no history.`)) return;
    try {
      await authHttp.delete(`/products/${productId}/variants/${v.id}?force=true`);
      await fetchVariants();
    } catch (err) {
      alert(errorMessage(err, 'Could not delete variant.'));
    }
  };

  if (loading) return <div style={{ padding: '32px' }}>Loading variants…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Product variants</h2>
          <p style={{ fontSize: '13px', color: '#666' }}>
            Manage the size/color/style variants of this product. Each variant has its own SKU, price, and stock level.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href="/admin/products" style={btnSecondary}><DirectionArrow kind="back" /> Products</Link>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            data-testid="new-variant"
            style={btnPrimary}
          >
            + New variant
          </button>
        </div>
      </div>

      {error && (
        <div style={errorBox}>{error}</div>
      )}

      {showForm && (
        <div style={card} data-testid="variant-form">
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
            {editingId ? 'Edit variant' : 'New variant'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <label style={label}>
              Name
              <input
                data-testid="variant-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={input}
              />
            </label>
            <label style={label}>
              SKU
              <input
                data-testid="variant-sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                style={input}
              />
            </label>
            <label style={label}>
              Price
              <input
                data-testid="variant-price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                style={input}
              />
            </label>
            <label style={label}>
              Quantity
              <input
                data-testid="variant-quantity"
                type="number"
                min="0"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                style={input}
              />
            </label>
            <label style={{ ...label, gridColumn: 'span 2' }}>
              Attributes (one per line, <code>key=value</code>)
              <textarea
                data-testid="variant-attributes"
                value={form.attributesText}
                onChange={(e) => setForm({ ...form, attributesText: e.target.value })}
                rows={4}
                placeholder={'size=M\ncolor=red'}
                style={{ ...input, fontFamily: 'monospace', fontSize: '13px' }}
              />
            </label>
            <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                data-testid="variant-active"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active (visible to customers)
            </label>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={resetForm} style={btnSecondary}>Cancel</button>
            <button onClick={submit} disabled={saving} data-testid="variant-save" style={btnPrimary}>
              {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Name</th>
              <th style={th}>SKU</th>
              <th style={th}>Price</th>
              <th style={th}>Qty</th>
              <th style={th}>Attributes</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {variants.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
                  No variants yet. Click "New variant" to add one.
                </td>
              </tr>
            )}
            {variants.map((v) => (
              <tr key={v.id} style={{ borderTop: '1px solid #e5e5e5' }} data-testid={`variant-row-${v.sku}`}>
                <td style={td}>{v.name}</td>
                <td style={td}><code>{v.sku}</code></td>
                <td style={td}>${v.price.toFixed(2)}</td>
                <td style={td}>{v.quantity}</td>
                <td style={td}>
                  {Object.entries(v.attributes || {}).map(([k, val]) => (
                    <span key={k} style={attrPill}>{k}: {val}</span>
                  ))}
                </td>
                <td style={td}>
                  <span style={statusBadge(v.isActive)}>{v.isActive ? 'active' : 'inactive'}</span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => startEdit(v)} style={btnSm} data-testid={`edit-${v.sku}`}>Edit</button>
                  {v.isActive && <button onClick={() => softDelete(v)} style={{ ...btnSm, color: '#f59e0b' }}>Deactivate</button>}
                  <button onClick={() => forceDelete(v)} style={{ ...btnSm, color: '#ef4444' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'white',
  borderRadius: '8px',
  border: '1px solid #e5e5e5',
  padding: '16px',
  marginBottom: '16px',
  // Allow the wide variants table to scroll horizontally on a phone
  // rather than clip; harmless on sections without an overflowing child.
  overflowX: 'auto',
};
const input: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px',
  border: '1px solid #e5e5e5', borderRadius: '4px', marginTop: '4px',
};
const label: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', fontSize: '13px', fontWeight: 500, color: '#374151',
};
const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: '14px' };
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px',
  cursor: 'pointer', textDecoration: 'none', fontSize: '14px',
};
const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', background: '#f5f5f5', color: '#000', border: 'none', borderRadius: '6px',
  cursor: 'pointer', textDecoration: 'none', fontSize: '14px',
};
const btnSm: React.CSSProperties = {
  padding: '4px 8px', background: '#f5f5f5', border: 'none', borderRadius: '4px',
  cursor: 'pointer', fontSize: '12px', marginLeft: '6px',
};
const errorBox: React.CSSProperties = {
  padding: '12px', background: '#fef2f2', border: '1px solid #ef4444',
  borderRadius: '6px', color: '#991b1b', marginBottom: '16px', fontSize: '14px',
};
const attrPill: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', margin: '0 4px 4px 0',
  background: '#eef2ff', color: '#3730a3', borderRadius: '50px', fontSize: '12px',
};
const statusBadge = (active: boolean): React.CSSProperties => ({
  padding: '2px 8px', borderRadius: '50px', fontSize: '12px',
  background: active ? '#22c55e20' : '#9ca3af20',
  color: active ? '#22c55e' : '#6b7280',
});
