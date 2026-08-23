'use client';

import { useState, useEffect } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

interface ReorderRule {
  id: string;
  productId: string;
  product?: { name: string; sku: string };
  threshold: number;
  reorderQty: number;
  supplierName?: string;
  isActive: boolean;
}

interface ReorderDraft {
  id: string;
  status: 'draft' | 'sent' | 'cancelled' | 'received';
  quantity: number;
  productId: string;
  product?: { name: string; sku: string };
  createdAt: string;
  sentAt?: string;
}

export default function ReorderPage() {
  const [tab, setTab] = useState<'rules' | 'drafts'>('rules');
  const [rules, setRules] = useState<ReorderRule[]>([]);
  const [drafts, setDrafts] = useState<ReorderDraft[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ productId: '', threshold: 10, reorderQty: 50, supplierName: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [r, d, p] = await Promise.all([
      authHttp.get<ReorderRule[]>('/inventory/reorder-rules'),
      authHttp.get<ReorderDraft[]>('/inventory/reorder-drafts'),
      authHttp.get<any[]>('/inventory'),
    ]);
    setRules(r.data || []);
    setDrafts(d.data || []);
    setProducts(p.data || []);
  };

  useEffect(() => { load().catch(console.error); }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await authHttp.post('/inventory/reorder-rules', form);
      setShowForm(false);
      await load();
    } catch (err) {
      alert(errorMessage(err, 'Could not create rule.'));
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      const res = await authHttp.post<{ draftsCreated: number; scanned: number }>('/inventory/reorder-rules/run', {});
      alert(`Scanned ${res.data.scanned} rules, created ${res.data.draftsCreated} drafts.`);
      await load();
    } catch (err) {
      alert(errorMessage(err, 'Could not run auto-reorder.'));
    } finally {
      setBusy(false);
    }
  };

  const setDraftStatus = async (id: string, status: string) => {
    try {
      await authHttp.patch(`/inventory/reorder-drafts/${id}`, { status });
      await load();
    } catch (err) {
      alert(errorMessage(err, 'Could not update draft.'));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => setTab('rules')} style={tabBtn(tab === 'rules')}>Rules ({rules.length})</button>
        <button onClick={() => setTab('drafts')} style={tabBtn(tab === 'drafts')}>Drafts ({drafts.length})</button>
        <div style={{ flex: 1 }} />
        <button onClick={runNow} disabled={busy} data-testid="run-reorder" style={{ padding: '8px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          ▶ Run auto-reorder now
        </button>
      </div>

      {tab === 'rules' && (
        <>
          <div style={{ marginBottom: '12px', textAlign: 'right' }}>
            <button onClick={() => setShowForm(!showForm)} data-testid="new-rule" style={{ padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              {showForm ? 'Cancel' : '+ New rule'}
            </button>
          </div>

          {showForm && (
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 2fr', gap: '12px' }}>
                <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} style={input}>
                  <option value="">— select product —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
                <input type="number" placeholder="Threshold" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: +e.target.value })} style={input} />
                <input type="number" placeholder="Reorder qty" value={form.reorderQty} onChange={(e) => setForm({ ...form, reorderQty: +e.target.value })} style={input} />
                <input placeholder="Supplier (optional)" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} style={input} />
              </div>
              <div style={{ marginTop: '12px', textAlign: 'right' }}>
                <button onClick={submit} disabled={busy || !form.productId} style={{ padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Create</button>
              </div>
            </div>
          )}

          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f9f9f9' }}>
                <th style={th}>Product</th><th style={th}>Threshold</th><th style={th}>Reorder qty</th><th style={th}>Supplier</th><th style={th}>Active</th>
              </tr></thead>
              <tbody>
                {rules.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No rules yet.</td></tr>}
                {rules.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                    <td style={td}>{r.product?.name || r.productId}</td>
                    <td style={td}>{r.threshold}</td>
                    <td style={td}>{r.reorderQty}</td>
                    <td style={td}>{r.supplierName || '—'}</td>
                    <td style={td}>{r.isActive ? '✅' : '❌'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'drafts' && (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Product</th><th style={th}>Quantity</th><th style={th}>Status</th><th style={th}>Created</th><th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr></thead>
            <tbody>
              {drafts.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No drafts yet — run auto-reorder to create some.</td></tr>}
              {drafts.map((d) => (
                <tr key={d.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                  <td style={td}>{d.product?.name || d.productId}</td>
                  <td style={td}>{d.quantity}</td>
                  <td style={td}><span style={badge(d.status)}>{d.status}</span></td>
                  <td style={td}>{new Date(d.createdAt).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {d.status === 'draft' && (
                      <>
                        <button onClick={() => setDraftStatus(d.id, 'sent')} style={btnSm}>Mark sent</button>
                        <button onClick={() => setDraftStatus(d.id, 'cancelled')} style={{ ...btnSm, color: '#ef4444' }}>Cancel</button>
                      </>
                    )}
                    {d.status === 'sent' && (
                      <button onClick={() => setDraftStatus(d.id, 'received')} style={btnSm}>Mark received</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = { padding: '8px', border: '1px solid #e5e5e5', borderRadius: '4px' };
const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: '14px' };
const btnSm: React.CSSProperties = { padding: '4px 8px', background: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginLeft: '6px' };
const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  background: active ? '#000' : 'white',
  color: active ? '#fff' : '#000',
  border: '1px solid #e5e5e5',
  borderRadius: '6px',
  cursor: 'pointer',
});
const badge = (s: string): React.CSSProperties => ({
  padding: '2px 8px', borderRadius: '50px', fontSize: '12px',
  background: s === 'received' ? '#22c55e20' : s === 'sent' ? '#3b82f620' : s === 'cancelled' ? '#ef444420' : '#f59e0b20',
  color: s === 'received' ? '#22c55e' : s === 'sent' ? '#3b82f6' : s === 'cancelled' ? '#ef4444' : '#f59e0b',
});
