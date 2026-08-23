'use client';

import { useState, useEffect } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

interface Warehouse {
  id: string;
  name: string;
  code: string;
  city?: string;
  region?: string;
  country?: string;
  isDefault: boolean;
  isActive: boolean;
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', country: 'US', city: '' });
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    try {
      const res = await authHttp.get<Warehouse[]>('/inventory/warehouses');
      setWarehouses(res.data || []);
    } catch (err) {
      console.error('Failed to load warehouses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const submit = async () => {
    setSaving(true);
    try {
      await authHttp.post('/inventory/warehouses', form);
      setShowForm(false);
      setForm({ name: '', code: '', country: 'US', city: '' });
      await fetch();
    } catch (err) {
      alert(errorMessage(err, 'Could not create warehouse.'));
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    try {
      await authHttp.post(`/inventory/warehouses/${id}/default`);
      await fetch();
    } catch (err) {
      alert(errorMessage(err, 'Could not change default warehouse.'));
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this warehouse?')) return;
    try {
      await authHttp.delete(`/inventory/warehouses/${id}`);
      await fetch();
    } catch (err) {
      alert(errorMessage(err, 'Could not delete warehouse.'));
    }
  };

  if (loading) return <div style={{ padding: '32px' }}>Loading warehouses…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Warehouses</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          data-testid="new-warehouse"
          style={{ padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          {showForm ? 'Cancel' : '+ New warehouse'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Code (DAL-01)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inputStyle} />
            <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
            <input placeholder="Country (US)" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ marginTop: '12px', textAlign: 'right' }}>
            <button onClick={submit} disabled={saving} style={{ padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Code</th>
              <th style={thStyle}>Location</th>
              <th style={thStyle}>Default</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No warehouses yet.</td></tr>
            )}
            {warehouses.map((w) => (
              <tr key={w.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                <td style={tdStyle}>{w.name}</td>
                <td style={tdStyle}>{w.code}</td>
                <td style={tdStyle}>{[w.city, w.country].filter(Boolean).join(', ') || '—'}</td>
                <td style={tdStyle}>{w.isDefault ? '⭐' : '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {!w.isDefault && (
                    <button onClick={() => setDefault(w.id)} style={btnSm}>Set default</button>
                  )}
                  {!w.isDefault && (
                    <button onClick={() => remove(w.id)} style={{ ...btnSm, color: '#ef4444' }}>Delete</button>
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

const inputStyle: React.CSSProperties = { padding: '8px', border: '1px solid #e5e5e5', borderRadius: '4px' };
const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: '14px' };
const btnSm: React.CSSProperties = { padding: '4px 8px', background: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '6px' };
