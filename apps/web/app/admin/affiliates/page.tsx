'use client';

/**
 * /admin/affiliates — the affiliate program manager.
 *
 * Three work areas in one page:
 *   1. Program settings (enable switch + default rate, saved via
 *      PUT /api/settings so the storefront switch is instant).
 *   2. Affiliates: list with identity + totals, approve / suspend,
 *      per-affiliate rate override.
 *   3. Commissions: approve / reject pending commissions.
 *   4. Payouts: approve / reject payout requests.
 *
 * All actions hit the API directly; the list refreshes after each one so
 * the page always shows the server's state.
 */
import { useState, useEffect, useCallback } from 'react';
import { authHttp, errorMessage } from '@/lib/http';
import {
  AdminAffiliate,
  AdminCommission,
  AdminPayout,
  listAffiliates,
  approveAffiliate,
  suspendAffiliate,
  setAffiliateRate,
  listCommissions,
  approveCommission,
  rejectCommission,
  voidCommission,
  listPayouts,
  approvePayout,
  rejectPayout,
  reversePayout,
} from '@/lib/affiliates';

type Tab = 'affiliates' | 'commissions' | 'payouts';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
  approved: 'Approved',
  rejected: 'Rejected',
  voided: 'Voided',
  paid: 'Paid',
  reversed: 'Reversed',
};

export default function AdminAffiliatesPage() {
  const [tab, setTab] = useState<Tab>('affiliates');
  const [affiliates, setAffiliates] = useState<AdminAffiliate[]>([]);
  const [commissions, setCommissions] = useState<AdminCommission[]>([]);
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Program settings form.
  const [enabled, setEnabled] = useState(false);
  const [rate, setRate] = useState('10');
  const [savingSettings, setSavingSettings] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [a, c, p] = await Promise.all([listAffiliates(), listCommissions(), listPayouts()]);
      setAffiliates(a);
      setCommissions(c);
      setPayouts(p);
    } catch (err) {
      setError(errorMessage(err, 'Could not load affiliate data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    // Load current program settings.
    authHttp
      .get<any>('/settings')
      .then((res) => {
        setEnabled(res.data?.affiliateEnabled === true);
        setRate(typeof res.data?.affiliateRate === 'number' ? String(res.data.affiliateRate) : '10');
      })
      .catch(() => {});
  }, [loadAll]);

  const saveSettings = async () => {
    setSavingSettings(true);
    setError('');
    try {
      const parsedRate = Number(rate);
      if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100) {
        throw new Error('Rate must be between 0 and 100.');
      }
      await authHttp.put('/settings', { affiliateEnabled: enabled, affiliateRate: parsedRate });
      setNotice(enabled ? 'Affiliate program enabled.' : 'Affiliate program disabled.');
    } catch (err) {
      setError(errorMessage(err, 'Could not save program settings.'));
    } finally {
      setSavingSettings(false);
    }
  };

  const run = async (fn: () => Promise<unknown>, okMessage: string) => {
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(okMessage);
      await loadAll();
    } catch (err) {
      setError(errorMessage(err, 'Action failed.'));
    }
  };

  const card: React.CSSProperties = {
    border: '1px solid var(--border, #e5e5e5)',
    borderRadius: '8px',
    backgroundColor: 'var(--card-bg, #fff)',
    padding: '20px',
    marginBottom: '16px',
  };

  const tabButton = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: '8px 16px',
        border: '1px solid var(--border, #ccc)',
        borderRadius: '6px',
        background: tab === t ? 'var(--brand, #000)' : 'transparent',
        color: tab === t ? 'var(--brand-text, #fff)' : 'inherit',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  const smallBtn = (label: string, onClick: () => void, danger = false) => (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        border: `1px solid ${danger ? '#dc2626' : 'var(--border, #ccc)'}`,
        borderRadius: '6px',
        background: danger ? '#fee2e2' : 'var(--card-bg, #fff)',
        color: danger ? '#b91c1c' : 'inherit',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        marginRight: '6px',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>Affiliate Program</h1>
      <p style={{ color: 'var(--muted, #666)', marginBottom: '16px' }}>
        Referral marketing: affiliates earn a commission on paid orders placed through their links.
      </p>

      {error && <p style={{ color: 'red', marginBottom: '12px' }}>{error}</p>}
      {notice && <p style={{ color: 'green', marginBottom: '12px' }}>{notice}</p>}

      {/* Program settings */}
      <div style={card}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Program settings</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} data-testid="affiliate-enabled" />
          Enable the affiliate program
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
          <label style={{ fontSize: '14px' }}>
            Default commission rate (%){' '}
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              data-testid="affiliate-rate"
              style={{
                width: '90px',
                padding: '8px',
                border: '1px solid var(--border, #ccc)',
                borderRadius: '6px',
                marginLeft: '6px',
              }}
            />
          </label>
        </div>
        <button
          onClick={saveSettings}
          disabled={savingSettings}
          style={{
            padding: '9px 16px',
            backgroundColor: 'var(--brand, #000)',
            color: 'var(--brand-text, #fff)',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: savingSettings ? 'wait' : 'pointer',
          }}
        >
          {savingSettings ? 'Saving…' : 'Save settings'}
        </button>
        <p style={{ fontSize: '13px', color: 'var(--muted, #666)', marginTop: '10px' }}>
          When enabled, any customer can apply; you approve them below. Commissions apply to
          orders placed through their links once the order is paid.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {tabButton('affiliates', `Affiliates (${affiliates.length})`)}
        {tabButton('commissions', `Commissions (${commissions.filter((c) => c.status === 'pending').length} pending)`)}
        {tabButton('payouts', `Payouts (${payouts.filter((p) => p.status === 'pending').length} pending)`)}
      </div>

      {loading && <p style={{ color: 'var(--muted, #666)' }}>Loading…</p>}

      {!loading && tab === 'affiliates' && (
        <div style={card}>
          {affiliates.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted, #666)' }}>No affiliates yet. Applications appear here.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }} data-testid="affiliates-table">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted, #666)', fontSize: '12px' }}>
                  <th style={{ padding: '6px' }}>Affiliate</th>
                  <th style={{ padding: '6px' }}>Code</th>
                  <th style={{ padding: '6px' }}>Status</th>
                  <th style={{ padding: '6px' }}>Rate</th>
                  <th style={{ padding: '6px' }}>Clicks</th>
                  <th style={{ padding: '6px' }}>Earned</th>
                  <th style={{ padding: '6px' }}>Paid</th>
                  <th style={{ padding: '6px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '6px' }}>
                      {a.user.firstName} {a.user.lastName}
                      <div style={{ fontSize: '12px', color: 'var(--muted, #666)' }}>{a.user.email}</div>
                    </td>
                    <td style={{ padding: '6px', direction: 'ltr' }}>{a.code}</td>
                    <td style={{ padding: '6px', textTransform: 'capitalize' }}>{STATUS_LABEL[a.status] ?? a.status}</td>
                    <td style={{ padding: '6px' }}>
                      {a.rateOverride !== null && a.rateOverride !== undefined ? (
                        <span>
                          {a.rateOverride}%
                          <button
                            onClick={() => run(() => setAffiliateRate(a.id, null), 'Rate reset to store default.')}
                            title="Reset to store default"
                            style={{ marginLeft: '6px', border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px' }}
                          >
                            reset
                          </button>
                        </span>
                      ) : (
                        <span
                          style={{ cursor: 'pointer', color: '#2563eb', fontSize: '12px' }}
                          onClick={() => {
                            const v = window.prompt(`Commission % for ${a.code} (blank = store default)`, '');
                            if (v === null) return;
                            const n = v.trim() === '' ? null : Number(v);
                            if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) {
                              setError('Rate must be between 0 and 100.');
                              return;
                            }
                            run(() => setAffiliateRate(a.id, n), 'Rate updated.');
                          }}
                        >
                          store default
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px' }}>{Number(a.clicks ?? 0)}</td>
                    <td style={{ padding: '6px' }}>{Number(a.totalEarned ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '6px' }}>{Number(a.totalPaid ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '6px' }}>
                      {a.status === 'pending' && smallBtn('Approve', () => run(() => approveAffiliate(a.id), `${a.code} approved.`))}
                      {a.status === 'active' && smallBtn('Suspend', () => run(() => suspendAffiliate(a.id), `${a.code} suspended.`), true)}
                      {a.status === 'suspended' && smallBtn('Reactivate', () => run(() => approveAffiliate(a.id), `${a.code} reactivated.`))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'commissions' && (
        <div style={card}>
          {commissions.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted, #666)' }}>No commissions yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }} data-testid="commissions-table">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted, #666)', fontSize: '12px' }}>
                  <th style={{ padding: '6px' }}>Affiliate</th>
                  <th style={{ padding: '6px' }}>Order</th>
                  <th style={{ padding: '6px' }}>Order total</th>
                  <th style={{ padding: '6px' }}>Rate</th>
                  <th style={{ padding: '6px' }}>Commission</th>
                  <th style={{ padding: '6px' }}>Status</th>
                  <th style={{ padding: '6px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '6px' }}>
                      {c.affiliate.user.firstName} {c.affiliate.user.lastName}
                      <div style={{ fontSize: '12px', color: 'var(--muted, #666)' }}>{c.affiliate.code}</div>
                    </td>
                    <td style={{ padding: '6px' }}>{c.orderNumber}</td>
                    <td style={{ padding: '6px' }}>{c.orderAmount.toFixed(2)}</td>
                    <td style={{ padding: '6px' }}>{c.rate}%</td>
                    <td style={{ padding: '6px', fontWeight: 600 }}>{c.amount.toFixed(2)}</td>
                    <td style={{ padding: '6px', textTransform: 'capitalize' }}>{STATUS_LABEL[c.status] ?? c.status}</td>
                    <td style={{ padding: '6px' }}>
                      {c.status === 'pending' && (
                        <>
                          {smallBtn('Approve', () => run(() => approveCommission(c.id), `Commission ${c.orderNumber} approved.`))}
                          {smallBtn('Reject', () => run(() => rejectCommission(c.id), `Commission ${c.orderNumber} rejected.`), true)}
                        </>
                      )}
                      {c.status === 'approved' && (
                        <>
                          {smallBtn('Void', () => run(() => voidCommission(c.id), `Commission ${c.orderNumber} voided — earnings clawed back.`), true)}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'payouts' && (
        <div style={card}>
          {payouts.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted, #666)' }}>No payout requests yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }} data-testid="payouts-table">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted, #666)', fontSize: '12px' }}>
                  <th style={{ padding: '6px' }}>Affiliate</th>
                  <th style={{ padding: '6px' }}>Requested</th>
                  <th style={{ padding: '6px' }}>Amount</th>
                  <th style={{ padding: '6px' }}>Status</th>
                  <th style={{ padding: '6px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '6px' }}>
                      {p.affiliate.user.firstName} {p.affiliate.user.lastName}
                      <div style={{ fontSize: '12px', color: 'var(--muted, #666)' }}>{p.affiliate.code}</div>
                    </td>
                    <td style={{ padding: '6px' }}>{new Date(p.requestedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '6px', fontWeight: 600 }}>{p.amount.toFixed(2)}</td>
                    <td style={{ padding: '6px', textTransform: 'capitalize' }}>{STATUS_LABEL[p.status] ?? p.status}</td>
                    <td style={{ padding: '6px' }}>
                      {p.status === 'pending' && (
                        <>
                          {smallBtn('Mark paid', () => run(() => approvePayout(p.id), 'Payout marked paid.'))}
                          {smallBtn('Reject', () => run(() => rejectPayout(p.id), 'Payout rejected.'), true)}
                        </>
                      )}
                      {p.status === 'paid' && (
                        <>
                          {smallBtn('Reverse', () => run(() => reversePayout(p.id), 'Payout reversed — totalPaid clawed back.'), true)}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
