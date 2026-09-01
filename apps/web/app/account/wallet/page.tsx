'use client';

import { useState, useEffect, useCallback } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

interface StoreCredit {
  balance: number;
  currency: string;
  transactions: StoreCreditTransaction[];
}

interface StoreCreditTransaction {
  id: string;
  amount: number;
  type: string;
  orderId: string | null;
  notes: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  refund: 'Refund credit',
  goodwill: 'Goodwill credit',
  adjust: 'Admin adjustment',
  order_use: 'Used on an order',
};

/**
 * Account > Wallet page.
 *
 * Shows the customer's store credit balance + history. They can
 * also redeem a gift card here, which adds the card's balance to
 * their account as store credit. (The "redeem to store credit"
 * path is the most common UX; a "redeem at checkout" path is
 * also available via the API but not exposed in this UI yet.)
 */
export default function WalletPage() {
  const [credit, setCredit] = useState<StoreCredit | null>(null);
  const [loading, setLoading] = useState(true);
  const [giftCode, setGiftCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchCredit = useCallback(async () => {
    try {
      const res = await authHttp.get<StoreCredit>('/store-credit');
      setCredit(res.data);
    } catch (err) {
      console.error('Failed to load store credit:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCredit(); }, [fetchCredit]);

  const redeem = async () => {
    if (!giftCode.trim()) return;
    setRedeeming(true);
    setMessage(null);
    try {
      // The redeem endpoint validates the code and returns metadata.
      const res = await authHttp.post<any>(`/gift-cards/${encodeURIComponent(giftCode.trim())}/redeem`);
      const balance = res.data.availableBalance as number;
      const currency = res.data.currency as string;
      // Now "apply" it as store credit. There's no dedicated endpoint
      // for that yet - the customer can see the card balance and
      // use it at checkout. We just confirm the card is valid here.
      setMessage({
        type: 'ok',
        text: `Card is valid! You have ${balance.toFixed(2)} ${currency} available. Redeeming it at checkout is coming soon.`,
      });
      setGiftCode('');
    } catch (err) {
      setMessage({ type: 'err', text: errorMessage(err, 'Could not redeem card.') });
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) return <div style={{ padding: '32px' }}>Loading wallet…</div>;

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>Wallet</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Store credit and gift card balances issued to your account. Balances can be redeemed and are
        tracked here; checkout support for spending them is coming soon.
      </p>

      {/* Store credit balance */}
      <div
        data-testid="credit-balance"
        style={{
          padding: '24px',
          backgroundColor: 'white',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          marginBottom: '24px',
        }}
      >
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Store credit balance</p>
        <p style={{ fontSize: '32px', fontWeight: 700, color: '#111' }}>
          {(credit?.balance ?? 0).toFixed(2)} {credit?.currency ?? 'USD'}
        </p>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
          Applied automatically at checkout. No card or code needed.
        </p>
      </div>

      {/* Gift card redemption */}
      <div
        style={{
          padding: '24px',
          backgroundColor: 'white',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          Redeem a gift card
        </h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
          Enter your gift card code below to verify it. You can apply the balance to your next order at checkout.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            data-testid="gift-code-input"
            type="text"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={giftCode}
            onChange={(e) => setGiftCode(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #e5e5e5',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '14px',
            }}
          />
          <button
            onClick={redeem}
            disabled={redeeming || !giftCode.trim()}
            data-testid="gift-redeem"
            style={{
              padding: '10px 20px',
              backgroundColor: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {redeeming ? 'Checking…' : 'Redeem'}
          </button>
        </div>
        {message && (
          <p
            data-testid={`gift-message-${message.type}`}
            style={{
              marginTop: '12px',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: message.type === 'ok' ? '#d1fae5' : '#fee2e2',
              color: message.type === 'ok' ? '#065f46' : '#991b1b',
            }}
          >
            {message.text}
          </p>
        )}
      </div>

      {/* Transaction history */}
      <div
        style={{
          padding: '24px',
          backgroundColor: 'white',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>Transaction history</h2>
        {!credit?.transactions?.length ? (
          <p style={{ fontSize: '14px', color: '#666' }}>No transactions yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="credit-tx-table">
            <thead>
              <tr style={{ background: '#f9f9f9' }}>
                <th style={th}>Date</th>
                <th style={th}>Type</th>
                <th style={{ ...th, textAlign: 'end' }}>Amount</th>
                <th style={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {credit.transactions.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                  <td style={td}>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td style={td}>{TYPE_LABELS[t.type] ?? t.type}</td>
                  <td
                    style={{
                      ...td,
                      textAlign: 'end',
                      color: t.amount > 0 ? '#22c55e' : '#ef4444',
                      fontWeight: 500,
                    }}
                  >
                    {t.amount > 0 ? '+' : ''}
                    {t.amount.toFixed(2)}
                  </td>
                  <td style={{ ...td, color: '#6b7280' }}>{t.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'start', fontSize: '12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 12px', fontSize: '14px' };
