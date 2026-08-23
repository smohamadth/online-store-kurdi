'use client';

import { useState, useEffect } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

interface Reservation {
  id: string;
  productId: string;
  product?: { name: string; sku: string };
  variantId?: string;
  quantity: number;
  reservedUntil: string;
  releasedAt?: string;
  reason: string;
  cartItemId?: string;
}

export default function ReservationsPage() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await authHttp.get<Reservation[]>('/inventory/reservations');
    setRows(res.data || []);
  };

  useEffect(() => { load().catch(console.error); }, []);

  const releaseExpired = async () => {
    setBusy(true);
    try {
      const res = await authHttp.post<{ released: number }>('/inventory/reservations/release-expired');
      alert(`Released ${res.data.released} expired reservations.`);
      await load();
    } catch (err) {
      alert(errorMessage(err, 'Could not release expired reservations.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Stock reservations</h2>
        <button
          onClick={releaseExpired}
          disabled={busy}
          data-testid="release-expired"
          style={{ padding: '8px 16px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          {busy ? 'Releasing…' : '⏰ Release expired'}
        </button>
      </div>

      <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
        Active reservations are held against the available pool. Reservations expire after their TTL (default 15 min for cart holds)
        and can be released manually with the button above.
      </p>

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Product</th>
              <th style={th}>Qty</th>
              <th style={th}>Reason</th>
              <th style={th}>Reserved until</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No active reservations.</td></tr>}
            {rows.map((r) => {
              const expired = new Date(r.reservedUntil).getTime() < Date.now();
              return (
                <tr key={r.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                  <td style={td}>{r.product?.name || r.productId}</td>
                  <td style={td}>{r.quantity}</td>
                  <td style={td}>{r.reason}</td>
                  <td style={td}>{new Date(r.reservedUntil).toLocaleString()}</td>
                  <td style={td}>
                    <span style={badge(expired ? 'expired' : 'active')}>
                      {expired ? 'expired' : 'active'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: '14px' };
const badge = (s: string): React.CSSProperties => ({
  padding: '2px 8px', borderRadius: '50px', fontSize: '12px',
  background: s === 'active' ? '#22c55e20' : '#f59e0b20',
  color: s === 'active' ? '#22c55e' : '#f59e0b',
});
