// /admin/accounting — the Accounting module.
//
// A lightweight, file-based double-entry bookkeeping UI: chart of accounts,
// journal, a general ledger (with running balance) and the classic reports.
// Everything reads/writes the /api/accounting endpoints, which enforce the
// double-entry invariant on the server (sum debits === sum credits), so a
// mis-posted entry is refused before it touches the ledger.
//
// Tabs:
//   Accounts — the chart of accounts; add, rename, open/close, delete.
//   Journal  — every posted entry, a balanced-entry composer, and one-click
//              reversing of a mistaken posting.
//   Ledger   — pick an account and read its posting history with a running
//              balance (the audit trail for a single account).
//   Reports  — trial balance, income statement (P&L) and balance sheet, all
//              filterable to a date range.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';
import { useStoreSettings } from '@/lib/settings';

// ---- Shared shapes ---------------------------------------------------------

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normalSide: 'debit' | 'credit';
  active: boolean;
}
interface JournalLine { accountId: string; debit: number; credit: number; }
interface JournalEntry {
  id: string;
  date: string;
  memo: string;
  reference?: string;
  currency: string;
  lines: JournalLine[];
  createdAt: string;
  voided: boolean;
  kind: 'normal' | 'closing';
}

const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Asset', liability: 'Liability', equity: 'Equity', revenue: 'Revenue', expense: 'Expense',
};

const card: React.CSSProperties = {
  backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: 10,
  padding: '18px 20px', marginBottom: 16,
};

const btn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontWeight: 600, fontSize: 14, color: '#fff', backgroundColor: '#4a4a6a',
};
const btnGhost: React.CSSProperties = { ...btn, backgroundColor: '#eef0f4', color: '#333' };
const btnDanger: React.CSSProperties = { ...btn, backgroundColor: '#ef4444' };

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700,
  letterSpacing: '0.04em', textTransform: 'uppercase', color: '#666', borderBottom: '2px solid #eee',
};
const tdStyle: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 14 };

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #d0d0d8', borderRadius: 6, fontSize: 14,
};

export default function AdminAccountingPage() {
  const isMobile = useIsMobile(700);
  const { settings } = useStoreSettings();
  const currency = settings.currencySymbol || '$';
  const money = (n: number) => `${currency}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [tab, setTab] = useState<'accounts' | 'journal' | 'orders' | 'ledger' | 'reports'>('accounts');
  const [token, setToken] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accountName, setAccountName] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Account add form
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AccountType>('expense');

  // Entry composer
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryMemo, setEntryMemo] = useState('');
  const [entryRef, setEntryRef] = useState('');
  const [entryCurrency, setEntryCurrency] = useState('USD');
  const [entryLines, setEntryLines] = useState<JournalLine[]>([
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
  ]);

  // Reports / ledger scope
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reportCurrency, setReportCurrency] = useState('');
  const [closeYearInput, setCloseYearInput] = useState(String(new Date().getFullYear()));

  useEffect(() => { setToken(localStorage.getItem('token')); }, []);

  const h = { Authorization: `Bearer ${token || ''}` };

  const fetchAll = useCallback(async () => {
    try {
      const t = localStorage.getItem('token');
      if (!t) return;
      const auth = { Authorization: `Bearer ${t}` };
      const [aRes, eRes, bRes] = await Promise.all([
        fetch(`${API_BASE}/accounting/accounts`, { headers: auth }),
        fetch(`${API_BASE}/accounting/entries`, { headers: auth }),
        fetch(`${API_BASE}/accounting/reports/balances`, { headers: auth }),
      ]);
      if (aRes.ok && eRes.ok) {
        const a = (await aRes.json()).data || [];
        setAccounts(a);
        setAccountName(Object.fromEntries(a.map((x: Account) => [x.id, x.name])));
        setEntries((await eRes.json()).data || []);
        if (bRes.ok) setBalances((await bRes.json()).data || []);
        setApiStatus('connected');
      } else setApiStatus('disconnected');
    } catch {
      setApiStatus('disconnected');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 4000); };

  // ---- Accounts ------------------------------------------------------------

  const addAccount = async () => {
    try {
      const res = await fetch(`${API_BASE}/accounting/accounts`, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode, name: newName, type: newType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not create account');
      setNewCode(''); setNewName('');
      flash(`Account ${data.data.code} created`);
      fetchAll();
    } catch (e: any) { flash(e.message); }
  };

  const setAccountActive = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/accounting/accounts/${id}`, {
        method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Update failed');
      flash(active ? 'Account reopened' : 'Account closed');
      fetchAll();
    } catch (e: any) { flash(e.message); }
  };

  const deleteAccount = async (id: string) => {
    if (!window.confirm('Delete this account? Only accounts with no postings can be deleted.')) return;
    try {
      const res = await fetch(`${API_BASE}/accounting/accounts/${id}`, { method: 'DELETE', headers: h });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Delete failed');
      flash('Account deleted');
      fetchAll();
    } catch (e: any) { flash(e.message); }
  };

  // ---- Journal -------------------------------------------------------------

  const updateLine = (i: number, patch: Partial<JournalLine>) => {
    setEntryLines((lines) => lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setEntryLines((lines) => [...lines, { accountId: '', debit: 0, credit: 0 }]);
  const removeLine = (i: number) => setEntryLines((lines) => (lines.length <= 2 ? lines : lines.filter((_, idx) => idx !== i)));

  const entryTotals = entryLines.reduce(
    (acc, l) => ({ debit: acc.debit + (Number(l.debit) || 0), credit: acc.credit + (Number(l.credit) || 0) }),
    { debit: 0, credit: 0 }
  );
  const entryBalanced = Math.abs(entryTotals.debit - entryTotals.credit) < 0.005 && entryTotals.debit > 0;

  const postEntry = async () => {
    try {
      const res = await fetch(`${API_BASE}/accounting/entries`, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: entryDate, memo: entryMemo, reference: entryRef || undefined, currency: entryCurrency || undefined,
          lines: entryLines.map((l) => ({ ...l, accountId: l.accountId || undefined, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not post entry');
      flash('Journal entry posted');
      setEntryMemo(''); setEntryRef('');
      setEntryLines([{ accountId: '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }]);
      fetchAll();
    } catch (e: any) { flash(e.message); }
  };

  const reverseEntry = async (id: string, memo: string) => {
    if (!window.confirm(`Post a reversing entry for "${memo}"? This creates an exact offsetting entry.`)) return;
    try {
      const res = await fetch(`${API_BASE}/accounting/entries/${id}/reverse`, {
        method: 'POST', headers: h,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not reverse entry');
      flash('Reversing entry posted');
      fetchAll();
    } catch (e: any) { flash(e.message); }
  };

  const voidEntry = async (id: string, memo: string) => {
    if (!window.confirm(`Void "${memo}"? It will stop counting toward balances/reports but stays in the journal.`)) return;
    try {
      const res = await fetch(`${API_BASE}/accounting/entries/${id}/void`, { method: 'POST', headers: h });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not void entry');
      flash('Entry voided');
      fetchAll();
    } catch (e: any) { flash(e.message); }
  };

  const closeFiscalYear = async () => {
    if (!window.confirm(`Close fiscal year ${closeYearInput}? Net income will move to retained earnings.`)) return;
    try {
      const res = await fetch(`${API_BASE}/accounting/entries/close-year/${closeYearInput}`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not close fiscal year');
      flash(`Fiscal year ${closeYearInput} closed`);
      fetchAll();
    } catch (e: any) { flash(e.message); }
  };

  // ---- Post from Order -----------------------------------------------------

  const [orderId, setOrderId] = useState('');
  const [orderSuggestion, setOrderSuggestion] = useState<any>(null);

  const previewOrder = async () => {
    try {
      const res = await fetch(`${API_BASE}/accounting/orders/${orderId}/suggest`, { headers: h });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not load order');
      setOrderSuggestion(data.data);
    } catch (e: any) { flash(e.message); }
  };

  const postFromOrder = async () => {
    try {
      const res = await fetch(`${API_BASE}/accounting/orders/${orderId}/post`, { method: 'POST', headers: h });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not post order entry');
      flash(`Posted sale entry for ${data.data.reference}`);
      setOrderSuggestion(null);
      fetchAll();
    } catch (e: any) { flash(e.message); }
  };

  // ---- CSV export ----------------------------------------------------------

  const downloadCsv = async (path: string, filename: string) => {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: h });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) { flash(e.message); }
  };

  // ---- Ledger --------------------------------------------------------------

  const [ledgerAccountId, setLedgerAccountId] = useState('');
  const [ledger, setLedger] = useState<any>(null);

  const loadLedger = async (accountId?: string) => {
    const id = accountId ?? ledgerAccountId;
    if (!id) return;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (reportCurrency) params.set('currency', reportCurrency);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/accounting/ledger/${id}${qs ? `?${qs}` : ''}`, { headers: h });
    const data = await res.json();
    if (res.ok) setLedger(data.data); else flash(data?.message || 'Could not load ledger');
  };

  // ---- Reports -------------------------------------------------------------

  const [balances, setBalances] = useState<any[]>([]);
  const [trial, setTrial] = useState<any[]>([]);
  const [pnl, setPnl] = useState<any>(null);
  const [bs, setBs] = useState<any>(null);

  const loadReports = async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (reportCurrency) params.set('currency', reportCurrency);
    const qs = params.toString();
    const url = (p: string) => `${API_BASE}/accounting/reports/${p}${qs ? `?${qs}` : ''}`;
    const [b, t, p, s] = await Promise.all([
      fetch(url('balances'), { headers: h }).then((r) => r.json()),
      fetch(url('trial-balance'), { headers: h }).then((r) => r.json()),
      fetch(url('income-statement'), { headers: h }).then((r) => r.json()),
      fetch(url('balance-sheet'), { headers: h }).then((r) => r.json()),
    ]);
    setBalances(b.data || []); setTrial(t.data || []); setPnl(p.data); setBs(s.data);
  };

  useEffect(() => { if (tab === 'reports') loadReports(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) {
    return <p style={{ color: '#666', padding: 24 }}>Loading accounting…</p>;
  }

  return (
    <div>
      {apiStatus === 'disconnected' && (
        <div style={{ ...card, backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
          ⚠️ Could not reach the accounting API. Check that the API server is running and you are signed in as an admin/manager.
        </div>
      )}
      {notice && (
        <div style={{ ...card, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>{notice}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          ['accounts', 'Chart of Accounts'],
          ['journal', 'Journal'],
          ['orders', 'Post from Order'],
          ['ledger', 'Ledger'],
          ['reports', 'Reports'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...(tab === t ? btn : btnGhost) }}>
            {label}
          </button>
        ))}
      </div>

      {/* Shared date-range filter (reports + ledger) */}
      {(tab === 'reports' || tab === 'ledger') && (
        <div style={{ ...card, padding: '12px 16px' }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr 1fr 1fr auto', alignItems: 'end' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Period</span>
            <label style={{ fontSize: 13, color: '#666' }}>From<input type="date" style={{ ...input, marginTop: 4 }} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label style={{ fontSize: 13, color: '#666' }}>To<input type="date" style={{ ...input, marginTop: 4 }} value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label style={{ fontSize: 13, color: '#666' }}>Currency<select style={{ ...input, marginTop: 4 }} value={reportCurrency} onChange={(e) => setReportCurrency(e.target.value)}>
              <option value="">All</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
            </select></label>
            <button style={btn} onClick={() => (tab === 'ledger' ? loadLedger() : loadReports())}>Apply</button>
          </div>
          {!from && !to && <p style={{ fontSize: 12, color: '#888', margin: '8px 0 0' }}>No period filter — showing the full journal.</p>}
        </div>
      )}

      {tab === 'accounts' && (
        <>
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Chart of Accounts</h3>
            <p style={{ margin: '0 0 14px', color: '#666', fontSize: 13 }}>
              Accounts carry a balance on their normal side (debit for assets/expenses, credit for liabilities/equity/revenue).
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Code</th><th style={thStyle}>Name</th><th style={thStyle}>Type</th>
                    <th style={thStyle}>Side</th><th style={thStyle}>Balance</th><th style={thStyle}>Status</th><th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const bal = balances.find((b) => b.account.id === a.id);
                    return (
                      <tr key={a.id} style={{ opacity: a.active ? 1 : 0.55 }}>
                        <td style={tdStyle}><b>{a.code}</b></td>
                        <td style={tdStyle}>{a.name}</td>
                        <td style={tdStyle}>{TYPE_LABEL[a.type]}</td>
                        <td style={tdStyle}>{a.normalSide}</td>
                        <td style={tdStyle}>{bal ? money(bal.balance) : money(0)}</td>
                        <td style={tdStyle}>{a.active ? 'Open' : 'Closed'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button style={btnGhost} onClick={() => setAccountActive(a.id, !a.active)}>
                            {a.active ? 'Close' : 'Reopen'}
                          </button>{' '}
                          <button style={btnDanger} onClick={() => deleteAccount(a.id)}>Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Add account</h3>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr 1fr auto' }}>
              <input style={input} placeholder="Code (e.g. 5900)" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
              <input style={input} placeholder="Name (e.g. Consulting fees)" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <select style={input} value={newType} onChange={(e) => setNewType(e.target.value as AccountType)}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button style={btn} onClick={addAccount}>Add</button>
            </div>
          </div>
        </>
      )}

      {tab === 'journal' && (
        <>
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>New journal entry</h3>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr auto', marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#666' }}>Date<input type="date" style={{ ...input, marginTop: 4 }} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></label>
              <label style={{ fontSize: 13, color: '#666' }}>Memo<input style={{ ...input, marginTop: 4 }} value={entryMemo} onChange={(e) => setEntryMemo(e.target.value)} placeholder="What is this for?" /></label>
              <label style={{ fontSize: 13, color: '#666' }}>Reference (optional)<input style={{ ...input, marginTop: 4 }} value={entryRef} onChange={(e) => setEntryRef(e.target.value)} placeholder="e.g. ORD-123" /></label>
              <label style={{ fontSize: 13, color: '#666' }}>Currency<input style={{ ...input, marginTop: 4, maxWidth: 90 }} value={entryCurrency} onChange={(e) => setEntryCurrency(e.target.value.toUpperCase())} placeholder="USD" /></label>
            </div>

            {entryLines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gap: 8, gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr auto', marginBottom: 8 }}>
                <select style={input} value={l.accountId} onChange={(e) => updateLine(i, { accountId: e.target.value })}>
                  <option value="">— select account —</option>
                  {accounts.filter((a) => a.active).map((a) => (
                    <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                  ))}
                </select>
                <input style={input} type="number" step="0.01" placeholder="Debit" value={l.debit || ''} onChange={(e) => updateLine(i, { debit: Number(e.target.value) })} />
                <input style={input} type="number" step="0.01" placeholder="Credit" value={l.credit || ''} onChange={(e) => updateLine(i, { credit: Number(e.target.value) })} />
                <button style={btnGhost} onClick={() => removeLine(i)}>✕</button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              <button style={btnGhost} onClick={addLine}>+ Add line</button>
              <span style={{ fontSize: 13, color: '#666' }}>
                Debits {money(entryTotals.debit)} / Credits {money(entryTotals.credit)}
              </span>
              {!entryBalanced && <span style={{ fontSize: 13, color: '#b45309' }}>⚠ Not balanced</span>}
              {entryBalanced && <span style={{ fontSize: 13, color: '#15803d' }}>✓ Balanced</span>}
              <div style={{ flex: 1 }} />
              <button style={{ ...btn, opacity: entryBalanced ? 1 : 0.5 }} disabled={!entryBalanced} onClick={postEntry}>
                Post entry
              </button>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Journal ({entries.length})</h3>
            {entries.length === 0 && <p style={{ color: '#888', fontSize: 14 }}>No entries yet. Post your first entry above.</p>}
            {entries.map((e) => (
              <div key={e.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 14 }}>{e.memo}</b>
                  <span style={{ fontSize: 12, color: '#888' }}>{e.date}{e.reference ? ` · ${e.reference}` : ''}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i}>
                        <td style={{ ...tdStyle, padding: '4px 12px' }}>{accountName[l.accountId] || '—'}</td>
                        <td style={{ ...tdStyle, padding: '4px 12px', textAlign: 'right' }}>{l.debit ? money(l.debit) : ''}</td>
                        <td style={{ ...tdStyle, padding: '4px 12px', textAlign: 'right' }}>{l.credit ? money(l.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 6, textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: e.voided ? '#b45309' : '#888', marginRight: 8 }}>
                    {e.currency} · {e.kind === 'closing' ? 'closing' : ''} {e.voided ? '· VOIDED' : ''}
                  </span>
                  {!e.voided && (
                    <>
                      <button style={btnGhost} onClick={() => reverseEntry(e.id, e.memo)}>↺ Reverse</button>{' '}
                      <button style={btnGhost} onClick={() => voidEntry(e.id, e.memo)}>Void</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'orders' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Post a sale from an order</h3>
          <p style={{ margin: '0 0 12px', color: '#666', fontSize: 13 }}>
            Paste an order id to build a balanced sale entry (sales, shipping, tax) and post it to the
            journal with one click. Paid orders debit the payment-gateway asset; unpaid orders debit
            accounts receivable. Posting is guarded against duplicates.
          </p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr auto', marginBottom: 12 }}>
            <input style={input} placeholder="Order id (UUID)" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
            <button style={btn} onClick={previewOrder}>Preview</button>
          </div>

          {orderSuggestion && (
            <>
              <p style={{ fontSize: 14, margin: '0 0 8px' }}>
                <b>{orderSuggestion.order.orderNumber}</b>{' '}
                <span style={{ color: '#666' }}>· {orderSuggestion.entry.date}</span>
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                  <thead><tr><th style={thStyle}>Account</th><th style={thStyle}>Debit</th><th style={thStyle}>Credit</th></tr></thead>
                  <tbody>
                    {orderSuggestion.entry.lines.map((l: any, i: number) => (
                      <tr key={i}>
                        <td style={tdStyle}>{accountName[l.accountId] || '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{l.debit ? money(l.debit) : ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{l.credit ? money(l.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 13, color: '#15803d' }}>✓ Balanced</span>
                <div style={{ flex: 1 }} />
                <button style={btn} onClick={postFromOrder}>Post entry</button>
              </div>
            </>
          )}
          {!orderSuggestion && <p style={{ color: '#888', fontSize: 14 }}>Enter an order id and click Preview to see the suggested entry.</p>}
        </div>
      )}

      {tab === 'ledger' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>General ledger</h3>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr auto', marginBottom: 14 }}>
            <select style={input} value={ledgerAccountId} onChange={(e) => setLedgerAccountId(e.target.value)}>
              <option value="">— select an account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
            <button style={btn} onClick={() => loadLedger()}>Load</button>
          </div>

          {ledger ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 10px', flexWrap: 'wrap', gap: 8 }}>
                <p style={{ fontSize: 14, margin: 0 }}>
                  <b>{ledger.account.code} · {ledger.account.name}</b>{' '}
                  <span style={{ color: '#666' }}>({TYPE_LABEL[ledger.account.type as AccountType]}, normal {ledger.account.normalSide})</span>
                </p>
                <button style={btnGhost} onClick={() => downloadCsv(`/accounting/export/ledger/${ledger.account.id}.csv`, `${ledger.account.code}-ledger.csv`)}>
                  Export CSV
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th><th style={thStyle}>Memo</th><th style={thStyle}>Ref</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Debit</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Credit</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Running balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((r: any, i: number) => (
                      <tr key={i}>
                        <td style={tdStyle}>{r.entry.date}</td>
                        <td style={tdStyle}>{r.entry.memo}</td>
                        <td style={tdStyle}>{r.entry.reference || ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.line.debit ? money(r.line.debit) : ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.line.credit ? money(r.line.credit) : ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{money(r.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ledger.rows.length === 0 && <p style={{ color: '#888', fontSize: 14 }}>No postings for this account in the selected period.</p>}
            </>
          ) : (
            <p style={{ color: '#888', fontSize: 14 }}>Select an account and click Load to see its posting history.</p>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <>
          <div style={{ ...card, padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Export</span>
              <button style={btnGhost} onClick={() => downloadCsv('/accounting/export/trial-balance.csv', 'trial-balance.csv')}>Trial balance (CSV)</button>
              <button style={btnGhost} onClick={() => downloadCsv('/accounting/export/income-statement.csv', 'income-statement.csv')}>Income statement (CSV)</button>
            </div>
          </div>
          <div style={{ ...card, padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Fiscal year close</span>
              <input style={{ ...input, maxWidth: 110 }} value={closeYearInput} onChange={(e) => setCloseYearInput(e.target.value)} placeholder="2024" />
              <button style={btn} onClick={closeFiscalYear}>Close year</button>
              <span style={{ fontSize: 12, color: '#888' }}>Moves that year's net income to retained earnings (per currency).</span>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            <div style={card}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Income statement (P&amp;L)</h3>
              {pnl && (
                <>
                  <GroupRows title="Revenue" rows={pnl.revenue} total={pnl.totalRevenue} money={money} />
                  <GroupRows title="Expenses" rows={pnl.expenses} total={pnl.totalExpenses} money={money} />
                  <Divider />
                  <Row label="Net income" value={pnl.netIncome} money={money} strong positive={pnl.netIncome >= 0} />
                </>
              )}
            </div>

            <div style={card}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Balance sheet</h3>
              {bs && (
                <>
                  <GroupRows title="Assets" rows={bs.assets.rows} total={bs.assets.total} money={money} />
                  <GroupRows title="Liabilities" rows={bs.liabilities.rows} total={bs.liabilities.total} money={money} />
                  <GroupRows title="Equity" rows={bs.equity.rows} total={bs.equity.total} money={money} />
                  <Divider />
                  <Row label="Balancing difference" value={bs.balancingDifference} money={money} strong positive={bs.balancingDifference === 0} />
                  <p style={{ fontSize: 12, color: bs.balanced ? '#15803d' : '#b45309', marginTop: 6 }}>
                    {bs.balanced ? '✓ Balanced (assets = liabilities + equity)' : '✗ Books are out of balance'}
                  </p>
                </>
              )}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Trial balance</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                <thead><tr><th style={thStyle}>Code</th><th style={thStyle}>Account</th><th style={thStyle}>Debits</th><th style={thStyle}>Credits</th></tr></thead>
                <tbody>
                  {trial.map((r) => (
                    <tr key={r.account.id}>
                      <td style={tdStyle}><b>{r.account.code}</b></td>
                      <td style={tdStyle}>{r.account.name}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.debit ? money(r.debit) : ''}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.credit ? money(r.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ ...tdStyle, fontWeight: 700 }}>Totals</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{money(trial.reduce((s, r) => s + r.debit, 0))}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{money(trial.reduce((s, r) => s + r.credit, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Small report building blocks -----------------------------------------

function GroupRows({ title, rows, total, money }: { title: string; rows: any[]; total: number; money: (n: number) => string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#555', margin: '8px 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</p>
      {rows.length === 0 && <Row label="(none)" value={0} money={money} />}
      {rows.map((r) => <Row key={r.account.id} label={`${r.account.code} · ${r.account.name}`} value={r.amount} money={money} />)}
      <Row label={`Total ${title}`} value={total} money={money} strong />
    </div>
  );
}

function Row({ label, value, money, strong, positive }: { label: string; value: number; money: (n: number) => string; strong?: boolean; positive?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, fontWeight: strong ? 700 : 400, color: positive !== undefined ? (positive ? '#15803d' : '#b45309') : '#111' }}>
      <span>{label}</span><span>{money(value)}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#e5e5e5', margin: '6px 0' }} />;
}
