'use client';

/**
 * Account > Affiliate — the program dashboard for store customers.
 *
 * States:
 *   - program disabled         -> info card
 *   - not applied              -> apply card
 *   - pending review           -> "under review" card
 *   - suspended                -> notice + read-only stats
 *   - active                   -> share link, stats grid, commission
 *                                 ledger, payout request + history
 *
 * Every number comes from GET /api/affiliates/me (server-computed), so the
 * UI can never disagree with the ledger.
 */
import { useState, useEffect, useCallback } from 'react';
import { errorMessage } from '@/lib/http';
import {
  MyAffiliateView,
  AffiliateCommission,
  AffiliatePayout,
  getMyAffiliate,
  applyAffiliate,
  getMyCommissions,
  getMyPayouts,
  requestPayout,
  buildAffiliateLink,
} from '@/lib/affiliates';

export default function AffiliatePage() {
  const [view, setView] = useState<MyAffiliateView | null>(null);
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [payouts, setPayouts] = useState<AffiliatePayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    try {
      const v = await getMyAffiliate();
      setView(v);
      if (v.affiliate) {
        const [c, p] = await Promise.all([getMyCommissions(), getMyPayouts()]);
        setCommissions(c);
        setPayouts(p);
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not load affiliate data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = async () => {
    setApplying(true);
    setError('');
    try {
      await applyAffiliate();
      setNotice('Application submitted — the store will review it shortly.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not submit the application.'));
    } finally {
      setApplying(false);
    }
  };

  const handleRequestPayout = async () => {
    setRequesting(true);
    setError('');
    try {
      const parsed = amount.trim() === '' ? undefined : Number(amount);
      await requestPayout(parsed);
      setAmount('');
      setNotice('Payout requested — the store will review it.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Could not request the payout.'));
    } finally {
      setRequesting(false);
    }
  };

  const handleCopy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice(`Copy your link: ${link}`);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted, #666)' }}>Loading…</div>;
  }

  const card: React.CSSProperties = {
    border: '1px solid var(--border, #e5e5e5)',
    borderRadius: '8px',
    backgroundColor: 'var(--card-bg, #fff)',
    padding: '20px',
    marginBottom: '16px',
  };

  // Program disabled — show an informational card only.
  if (view && !view.programEnabled) {
    return (
      <div style={{ maxWidth: '760px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>Affiliate Program</h1>
        <div style={card}>
          <p style={{ margin: 0, color: 'var(--muted, #666)' }}>
            This store does not currently offer an affiliate program. Check back later.
          </p>
        </div>
      </div>
    );
  }

  // No profile yet — apply.
  if (view && !view.affiliate) {
    return (
      <div style={{ maxWidth: '760px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>Affiliate Program</h1>
        {notice && <p style={{ color: 'green', marginBottom: '12px' }}>{notice}</p>}
        {error && <p style={{ color: 'red', marginBottom: '12px' }}>{error}</p>}
        <div style={card}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Earn a commission on every sale you refer</h2>
          <p style={{ color: 'var(--muted, #666)', marginBottom: '16px' }}>
            Share your personal link; when someone buys through it, you earn a commission once
            the order is paid. Apply below — the store reviews applications before activation.
          </p>
          <button
            onClick={handleApply}
            disabled={applying}
            style={{
              padding: '10px 18px',
              backgroundColor: 'var(--brand, #000)',
              color: 'var(--brand-text, #fff)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: applying ? 'wait' : 'pointer',
            }}
          >
            {applying ? 'Applying…' : 'Apply to the program'}
          </button>
        </div>
      </div>
    );
  }

  const stats = view?.stats;
  const affiliate = view?.affiliate;
  const isActive = affiliate?.status === 'active';
  const link = affiliate ? buildAffiliateLink(affiliate.code) : '';

  const statCard = (label: string, value: string) => (
    <div
      style={{
        flex: '1 1 140px',
        border: '1px solid var(--border, #e5e5e5)',
        borderRadius: '8px',
        padding: '14px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '22px', fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--muted, #666)', marginTop: '4px' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: '760px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>Affiliate Program</h1>
      {error && <p style={{ color: 'red', marginBottom: '12px' }}>{error}</p>}
      {notice && <p style={{ color: 'green', marginBottom: '12px' }}>{notice}</p>}

      {affiliate?.status === 'pending' && (
        <div style={card}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Application under review</h2>
          <p style={{ margin: 0, color: 'var(--muted, #666)' }}>
            Your application is pending. Once the store approves it, your referral link will
            appear here and start earning.
          </p>
        </div>
      )}

      {affiliate?.status === 'suspended' && (
        <div style={{ ...card, borderColor: '#d97706' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#92400e' }}>
            Your affiliate account is suspended
          </h2>
          <p style={{ margin: 0, color: '#92400e' }}>
            Contact the store for details. Referral links are not earning while suspended.
          </p>
        </div>
      )}

      {isActive && (
        <>
          <div style={card}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Your referral link</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                readOnly
                value={link}
                data-testid="affiliate-link"
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: '1 1 260px',
                  padding: '10px',
                  border: '1px solid var(--border, #ccc)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  direction: 'ltr',
                  textAlign: 'start',
                }}
              />
              <button
                onClick={() => handleCopy(link)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid var(--border, #ccc)',
                  borderRadius: '6px',
                  background: 'var(--card-bg, #fff)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted, #666)', marginTop: '8px' }}>
              Share this link anywhere. When a visitor buys through it within 30 days, you earn a
              commission on the paid order.
            </p>
          </div>

          {stats && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {statCard('Clicks', String(stats.clicks))}
              {statCard('Orders', String(stats.referredOrders))}
              {statCard('Pending', stats.pendingEarnings.toFixed(2))}
              {statCard('Approved', stats.approvedEarnings.toFixed(2))}
              {statCard('Paid out', stats.paidOut.toFixed(2))}
              {statCard('Available', stats.available.toFixed(2))}
            </div>
          )}

          <div style={card}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Request a payout</h2>
            <p style={{ fontSize: '13px', color: 'var(--muted, #666)', marginBottom: '10px' }}>
              Withdraw your approved earnings. The store reviews each request before paying.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={stats ? `Amount (${stats.available.toFixed(2)} available)` : 'Amount'}
                value={amount}
                data-testid="payout-amount"
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  flex: '1 1 200px',
                  padding: '10px',
                  border: '1px solid var(--border, #ccc)',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              />
              <button
                onClick={handleRequestPayout}
                disabled={requesting || !stats || stats.available <= 0}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'var(--brand, #000)',
                  color: 'var(--brand-text, #fff)',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: requesting ? 'wait' : 'pointer',
                  opacity: !stats || stats.available <= 0 ? 0.5 : 1,
                }}
              >
                {requesting ? 'Requesting…' : 'Request payout'}
              </button>
            </div>
          </div>

          <div style={card}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Commissions</h2>
            {commissions.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted, #666)' }}>No referred orders yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }} data-testid="commission-table">
                <thead>
                  <tr style={{ textAlign: 'start', color: 'var(--muted, #666)', fontSize: '12px' }}>
                    <th style={{ padding: '6px' }}>Order</th>
                    <th style={{ padding: '6px' }}>Amount</th>
                    <th style={{ padding: '6px' }}>Rate</th>
                    <th style={{ padding: '6px' }}>Commission</th>
                    <th style={{ padding: '6px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                      <td style={{ padding: '6px' }}>{c.orderNumber}</td>
                      <td style={{ padding: '6px' }}>{c.orderAmount.toFixed(2)}</td>
                      <td style={{ padding: '6px' }}>{c.rate}%</td>
                      <td style={{ padding: '6px', fontWeight: 600 }}>{c.amount.toFixed(2)}</td>
                      <td style={{ padding: '6px', textTransform: 'capitalize' }}>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={card}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Payout history</h2>
            {payouts.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted, #666)' }}>No payouts yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ textAlign: 'start', color: 'var(--muted, #666)', fontSize: '12px' }}>
                    <th style={{ padding: '6px' }}>Requested</th>
                    <th style={{ padding: '6px' }}>Amount</th>
                    <th style={{ padding: '6px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                      <td style={{ padding: '6px' }}>{new Date(p.requestedAt).toLocaleDateString()}</td>
                      <td style={{ padding: '6px', fontWeight: 600 }}>{p.amount.toFixed(2)}</td>
                      <td style={{ padding: '6px', textTransform: 'capitalize' }}>{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
