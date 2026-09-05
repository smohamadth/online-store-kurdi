'use client';

import { useCallback, useEffect, useState } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

type Row = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rateToBase: number;
  isEnabled: boolean;
  manuallySet?: boolean;
};

export default function AdminCurrenciesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', symbol: '', rateToBase: '1' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authHttp.get<Row[]>('/currencies/all');
      setRows(res.data || []);
    } catch (e) {
      setError(errorMessage(e, 'Could not load currencies.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await authHttp.post('/currencies', {
        code: form.code.toUpperCase(),
        name: form.name,
        symbol: form.symbol,
        rateToBase: Number(form.rateToBase),
        isEnabled: true,
      });
      setForm({ code: '', name: '', symbol: '', rateToBase: '1' });
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Could not add currency.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: Row) => {
    try {
      await authHttp.put(`/currencies/${row.id}`, { isEnabled: !row.isEnabled });
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Could not update currency.'));
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const res = await authHttp.post<{ fetched: number; skipped: number; errors: string[] }>('/currencies/refresh', {});
      await load();
      setError(
        res.data?.errors?.length
          ? res.data.errors.join('; ')
          : null,
      );
    } catch (e) {
      setError(errorMessage(e, 'Refresh failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Currencies</h2>
          <p style={{ fontSize: 13, color: '#666' }}>
            Extra currencies for the storefront picker. The store display currency is still Settings → Currency.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={busy} style={{ padding: '8px 14px', border: '1px solid #111', borderRadius: 6, background: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          Refresh rates
        </button>
      </div>
      {error && <p style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</p>}
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <input placeholder="USD" value={form.code} maxLength={3} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inp} />
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
        <input placeholder="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} style={inp} />
        <input placeholder="Rate to base" value={form.rateToBase} onChange={(e) => setForm({ ...form, rateToBase: e.target.value })} style={inp} />
        <button type="button" onClick={add} disabled={busy} style={{ padding: '8px 12px', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600 }}>
          Add
        </button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Code</th>
              <th style={th}>Name</th>
              <th style={th}>Rate</th>
              <th style={th}>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={td}>{r.code} {r.symbol}</td>
                <td style={td}>{r.name}</td>
                <td style={td}>{Number(r.rateToBase).toFixed(4)}</td>
                <td style={td}>
                  <button type="button" onClick={() => toggle(r)} style={{ fontSize: 13, cursor: 'pointer' }}>
                    {r.isEnabled ? 'On' : 'Off'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { padding: 8, border: '1px solid #e5e5e5', borderRadius: 4 };
const th: React.CSSProperties = { textAlign: 'left', padding: 12, fontSize: 12 };
const td: React.CSSProperties = { padding: 12, fontSize: 14 };
