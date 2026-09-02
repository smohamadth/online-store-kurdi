// /admin/inventory/stock-takes - cycle counts: create a stock take
// (snapshot the counted quantities), then apply it, which adjusts
// the system stock to the counted values and writes an InventoryLog
// row per difference. Cancelling a take leaves stock untouched.
'use client';

import { useState, useEffect } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

interface StockTake {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  appliedAt?: string;
  items: { productId: string; expected: number; counted: number; variance: number }[];
  warehouse?: { code: string; name: string };
}

interface Product {
  id: string;
  name: string;
  sku: string;
  quantity: number;
}

export default function StockTakesPage() {
  const [takes, setTakes] = useState<StockTake[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('Weekly count');
  const [warehouseId, setWarehouseId] = useState('');
  const [rows, setRows] = useState<{ productId: string; expected: number; counted: number; notes: string }[]>([]);

  const load = async () => {
    const [t, p, w] = await Promise.all([
      authHttp.get<StockTake[]>('/inventory/stock-takes'),
      authHttp.get<Product[]>('/inventory'),
      authHttp.get<any[]>('/inventory/warehouses'),
    ]);
    setTakes(t.data || []);
    setProducts(p.data || []);
    setWarehouses(w.data || []);
  };

  useEffect(() => { load().catch(console.error); }, []);

  const addRow = () => {
    if (products.length === 0) return;
    setRows([...rows, { productId: products[0]!.id, expected: products[0]!.quantity, counted: products[0]!.quantity, notes: '' }]);
  };

  const submit = async () => {
    try {
      await authHttp.post('/inventory/stock-takes', {
        name,
        warehouseId: warehouseId || undefined,
        items: rows,
      });
      setShowForm(false);
      setRows([]);
      await load();
    } catch (err) {
      alert(errorMessage(err, 'Could not create stock take.'));
    }
  };

  const apply = async (id: string) => {
    if (!confirm('Apply this stock take? Product quantities will be updated.')) return;
    try {
      await authHttp.post(`/inventory/stock-takes/${id}/apply`);
      await load();
    } catch (err) {
      alert(errorMessage(err, 'Could not apply stock take.'));
    }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancel this stock take?')) return;
    try {
      await authHttp.post(`/inventory/stock-takes/${id}/cancel`);
      await load();
    } catch (err) {
      alert(errorMessage(err, 'Could not cancel stock take.'));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Stock takes (cycle counts)</h2>
        <button
          onClick={() => { setShowForm(!showForm); if (!showForm) addRow(); }}
          data-testid="new-stock-take"
          style={{ padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          {showForm ? 'Cancel' : '+ New stock take'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Take name" style={input} />
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} style={input}>
              <option value="">Default warehouse</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </select>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
            <thead>
              <tr><th style={th}>Product</th><th style={th}>Expected</th><th style={th}>Counted</th><th style={th}>Notes</th><th style={th}></th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <select value={r.productId} onChange={(e) => {
                      const p = products.find((p) => p.id === e.target.value);
                      const rows2 = [...rows];
                      rows2[i] = { ...rows2[i]!, productId: e.target.value, expected: p?.quantity ?? 0, counted: p?.quantity ?? 0 };
                      setRows(rows2);
                    }} style={input}>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={r.expected} onChange={(e) => { const rows2 = [...rows]; rows2[i] = { ...rows2[i]!, expected: +e.target.value }; setRows(rows2); }} style={input} /></td>
                  <td><input type="number" value={r.counted} onChange={(e) => { const rows2 = [...rows]; rows2[i] = { ...rows2[i]!, counted: +e.target.value }; setRows(rows2); }} style={input} /></td>
                  <td><input value={r.notes} onChange={(e) => { const rows2 = [...rows]; rows2[i] = { ...rows2[i]!, notes: e.target.value }; setRows(rows2); }} style={input} /></td>
                  <td><button onClick={() => setRows(rows.filter((_, j) => j !== i))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addRow} style={{ padding: '6px 12px', background: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Add row</button>
            <button onClick={submit} style={{ padding: '6px 12px', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Create</button>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f9f9f9' }}><th style={th}>Name</th><th style={th}>Status</th><th style={th}>Warehouse</th><th style={th}>Items</th><th style={{ ...th, textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {takes.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No stock takes yet.</td></tr>}
            {takes.map((t) => (
              <tr key={t.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                <td style={td}>{t.name}</td>
                <td style={td}><span style={statusBadge(t.status)}>{t.status}</span></td>
                <td style={td}>{t.warehouse?.code || '—'}</td>
                <td style={td}>{t.items?.length ?? 0}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {t.status === 'in_progress' && (
                    <>
                      <button onClick={() => apply(t.id)} style={btnSm}>Apply</button>
                      <button onClick={() => cancel(t.id)} style={{ ...btnSm, color: '#ef4444' }}>Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const input: React.CSSProperties = { padding: '6px', border: '1px solid #e5e5e5', borderRadius: '4px', width: '100%' };
const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: '14px' };
const btnSm: React.CSSProperties = { padding: '4px 8px', background: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '6px' };
const statusBadge = (s: string): React.CSSProperties => ({
  padding: '2px 8px', borderRadius: '50px', fontSize: '12px',
  background: s === 'applied' ? '#22c55e20' : s === 'cancelled' ? '#ef444420' : '#f59e0b20',
  color: s === 'applied' ? '#22c55e' : s === 'cancelled' ? '#ef4444' : '#f59e0b',
});
