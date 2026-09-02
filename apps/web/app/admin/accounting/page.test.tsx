/**
 * /admin/accounting — the file-based double-entry bookkeeping UI.
 *
 * Covers:
 *   - the chart of accounts renders seeded accounts with balances
 *   - the journal tab lists posted entries and the composer shows a balanced
 *     state for an equal debit/credit pair
 *   - the reverse action POSTs a reversing entry
 *   - the reports tab renders the income statement and a balanced balance sheet
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminAccountingPage from './page';
import { setNextRouter } from '@/test/setup-components';

vi.mock('@/lib/hooks', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({ settings: { currencySymbol: '$' }, loading: false }),
  formatPrice: (n: number, sym: string) => `${sym}${Number(n).toFixed(2)}`,
}));

const cash = { id: 'acc-1000', code: '1000', name: 'Cash on hand', type: 'asset', normalSide: 'debit', active: true };
const sales = { id: 'acc-4000', code: '4000', name: 'Product sales', type: 'revenue', normalSide: 'credit', active: true };
const accounts = [cash, sales];

const entries = [{
  id: 'e1',
  date: '2024-01-15',
  memo: 'Test sale',
  reference: 'ORD-1',
  currency: 'USD',
  lines: [
    { accountId: 'acc-1000', debit: 100, credit: 0 },
    { accountId: 'acc-4000', debit: 0, credit: 100 },
  ],
  createdAt: '2024-01-15T10:00:00.000Z',
  voided: false,
  kind: 'normal',
}, {
  id: 'e-close',
  date: '2024-12-31',
  memo: 'Close fiscal year 2024',
  reference: undefined,
  currency: 'USD',
  lines: [
    { accountId: 'acc-4000', debit: 100, credit: 0 },
    { accountId: 'acc-3100', debit: 0, credit: 100 },
  ],
  createdAt: '2024-12-31T10:00:00.000Z',
  voided: false,
  kind: 'closing',
}];

const balances = [{ account: cash, balance: 100, debits: 100, credits: 0 }];

const report = (path: string) => {
  if (path.includes('trial-balance')) return { status: 'success', data: [{ account: cash, debit: 100, credit: 0 }] };
  if (path.includes('income-statement')) {
    return { status: 'success', data: { revenue: [{ account: sales, amount: 100 }], totalRevenue: 100, expenses: [], totalExpenses: 0, netIncome: 100 } };
  }
  if (path.includes('balance-sheet')) {
    return { status: 'success', data: { assets: { total: 100, rows: [{ account: cash, amount: 100 }] }, liabilities: { total: 0, rows: [] }, equity: { total: 100, rows: [] }, balancingDifference: 0, balanced: true } };
  }
  if (path.includes('balances')) return { status: 'success', data: balances };
  return { status: 'success', data: [] };
};

const orderSuggestion = {
  status: 'success',
  data: {
    order: { orderNumber: 'ORD-100', id: 'ord-1' },
    entry: {
      date: '2024-01-15',
      memo: 'Sale — order ORD-100',
      reference: 'ORD-100',
      lines: [
        { accountId: 'acc-1000', debit: 115, credit: 0 },
        { accountId: 'acc-4000', debit: 0, credit: 100 },
      ],
    },
  },
};

function mockApi() {
  const fetchMock = vi.fn(async (url: string, opts?: any) => {
    const u = String(url);
    const method = opts?.method || 'GET';
    if (u.includes('/accounting/entries/close-year/') && method === 'POST') {
      return new Response(JSON.stringify({ status: 'success', data: { id: 'c1', kind: 'closing' } }), { status: 200 });
    }
    if (u.includes('/accounting/entries/') && u.includes('/void') && method === 'POST') {
      return new Response(JSON.stringify({ status: 'success', data: { id: 'e1', voided: true } }), { status: 200 });
    }
    if (u.includes('/accounting/entries/') && method === 'POST') {
      return new Response(JSON.stringify({ status: 'success', data: { id: 'e2', memo: 'REVERSE — Test sale' } }), { status: 200 });
    }
    if (u.includes('/accounting/orders/') && method === 'POST') {
      return new Response(JSON.stringify({ status: 'success', data: { reference: 'ORD-100' } }), { status: 200 });
    }
    if (u.includes('/accounting/orders/')) {
      return new Response(JSON.stringify(orderSuggestion), { status: 200 });
    }
    if (u.includes('/accounting/export/')) {
      return new Response('code,account,debit,credit\n1000,Cash on hand,115,0\n', { status: 200 });
    }
    if (u.includes('/accounting/accounts')) return new Response(JSON.stringify({ status: 'success', data: accounts }), { status: 200 });
    if (u.includes('/accounting/entries')) return new Response(JSON.stringify({ status: 'success', data: entries }), { status: 200 });
    if (u.includes('/accounting/reports/')) return new Response(JSON.stringify(report(u)), { status: 200 });
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  setNextRouter({ pathname: '/admin/accounting' });
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ role: 'admin', firstName: 'Admin' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('/admin/accounting', () => {
  it('renders the chart of accounts with balances', async () => {
    mockApi();
    render(<AdminAccountingPage />);
    expect(await screen.findByText('Cash on hand')).toBeInTheDocument();
    expect(screen.getByText('Product sales')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
  });

  it('shows journal entries and gates posting on a balanced composer', async () => {
    mockApi();
    render(<AdminAccountingPage />);
    await screen.findByText('Cash on hand');

    fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
    expect(await screen.findByText('Test sale')).toBeInTheDocument();
    expect(screen.getByText(/ORD-1/)).toBeInTheDocument();

    // Empty composer (both lines zero) is not balanced.
    expect(await screen.findByText(/Not balanced/)).toBeInTheDocument();
    const post = screen.getByRole('button', { name: 'Post entry' });
    expect(post).toBeDisabled();

    // Fill debit 50 on line 0 and credit 50 on line 1 => balanced, postable.
    fireEvent.change(screen.getAllByPlaceholderText('Debit')[0], { target: { value: '50' } });
    fireEvent.change(screen.getAllByPlaceholderText('Credit')[1], { target: { value: '50' } });
    expect(await screen.findByText('✓ Balanced')).toBeInTheDocument();
    expect(post).not.toBeDisabled();
  });

  it('reverse posts an offsetting entry', async () => {
    const fetchMock = mockApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminAccountingPage />);
    await screen.findByText('Cash on hand');

    fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
    await screen.findByText('Test sale');
    fireEvent.click(screen.getAllByRole('button', { name: '↺ Reverse' })[0]);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => String(u).includes('/accounting/entries/') && (o?.method || 'GET') === 'POST');
      expect(call).toBeTruthy();
    });
  });

  it('renders the income statement and balance sheet on the Reports tab', async () => {
    mockApi();
    render(<AdminAccountingPage />);
    await screen.findByText('Cash on hand');

    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    expect(await screen.findByText('Income statement (P&L)')).toBeInTheDocument();
    expect(screen.getByText('Balance sheet')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0));
    expect(screen.getByText(/✓ Balanced/)).toBeInTheDocument();
  });

  it('previews and posts a sale entry from an order', async () => {
    const fetchMock = mockApi();
    render(<AdminAccountingPage />);
    await screen.findByText('Cash on hand');

    fireEvent.click(screen.getByRole('button', { name: 'Post from Order' }));
    fireEvent.change(screen.getByPlaceholderText('Order id (UUID)'), { target: { value: 'ord-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('ORD-100')).toBeInTheDocument();
    expect(screen.getByText('$115.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Post entry' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => String(u).includes('/accounting/orders/') && (o?.method || 'GET') === 'POST');
      expect(call).toBeTruthy();
    });
  });

  it('downloads a CSV export from the Reports tab', async () => {
    const fetchMock = mockApi();
    render(<AdminAccountingPage />);
    await screen.findByText('Cash on hand');

    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    await screen.findByText('Income statement (P&L)');
    fireEvent.click(screen.getByRole('button', { name: 'Trial balance (CSV)' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/accounting/export/'));
      expect(call).toBeTruthy();
    });
  });

  it('voids an entry from the journal', async () => {
    const fetchMock = mockApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminAccountingPage />);
    await screen.findByText('Cash on hand');

    fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
    await screen.findByText('Test sale');
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => String(u).includes('/accounting/entries/') && String(u).includes('/void') && (o?.method || 'GET') === 'POST');
      expect(call).toBeTruthy();
    });
  });

  it('does not offer a Void action on a closing entry', async () => {
    mockApi();
    render(<AdminAccountingPage />);
    await screen.findByText('Cash on hand');

    fireEvent.click(screen.getByRole('button', { name: 'Journal' }));
    await screen.findByText('Close fiscal year 2024');

    // The closing entry is in the journal but must NOT expose a Void button
    // (the server rejects voiding closing entries). Walk up from the memo to
    // the entry card (the ancestor that contains the action buttons) and
    // assert it shows the "closing" badge but no Void action.
    const cardOf = (el: Element) => {
      let n: HTMLElement | null = el as HTMLElement;
      while (n) {
        if (n.querySelector('button') && n.textContent!.includes('Close fiscal year 2024')) return n;
        n = n.parentElement;
      }
      return null;
    };
    const closingCard = cardOf(screen.getByText('Close fiscal year 2024'));
    expect(closingCard).not.toBeNull();
    expect(closingCard!.textContent).toContain('closing');
    expect(closingCard!.textContent).not.toContain('Void');

    // The normal entry still has one.
    const normalCard = cardOf(screen.getByText('Test sale'));
    expect(normalCard!.textContent).toContain('Void');
  });

  it('closes a fiscal year from the Reports tab', async () => {
    const fetchMock = mockApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminAccountingPage />);
    await screen.findByText('Cash on hand');

    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    await screen.findByText('Income statement (P&L)');
    fireEvent.click(screen.getByRole('button', { name: 'Close year' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u, o]) => String(u).includes('/accounting/entries/close-year/') && (o?.method || 'GET') === 'POST');
      expect(call).toBeTruthy();
    });
  });
});
