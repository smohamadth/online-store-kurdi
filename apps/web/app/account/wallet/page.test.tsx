/**
 * Component test for the customer wallet page.
 *
 * The page talks to authHttp for the balance + gift card
 * verification; we mock the helpers and assert on the rendered
 * shape. Heavy I/O is covered by the API integration tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WalletPage from './page';

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock('@/lib/http', () => ({
  authHttp: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  errorMessage: (_err: unknown, fallback: string) => fallback,
}));

describe('Wallet page', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockGet.mockResolvedValue({ data: { balance: 0, currency: 'USD', transactions: [] } });
  });

  it('renders the page title and the empty-state balance', async () => {
    render(<WalletPage />);
    await waitFor(() => {
      expect(screen.getByText('Wallet')).toBeInTheDocument();
    });
    expect(screen.getByTestId('credit-balance')).toHaveTextContent('0.00');
  });

  it('renders a non-zero balance', async () => {
    mockGet.mockResolvedValueOnce({
      data: { balance: 42.50, currency: 'USD', transactions: [] },
    });
    render(<WalletPage />);
    await waitFor(() => {
      expect(screen.getByTestId('credit-balance')).toHaveTextContent('42.50');
    });
  });

  it('renders the transaction history with type labels', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        balance: 25, currency: 'USD',
        transactions: [
          { id: 't1', amount: 50, type: 'refund', orderId: null, notes: 'Order #42', createdAt: '2026-08-01T00:00:00Z' },
          { id: 't2', amount: -25, type: 'order_use', orderId: 'o-1', notes: null, createdAt: '2026-08-02T00:00:00Z' },
        ],
      },
    });
    render(<WalletPage />);
    await waitFor(() => {
      expect(screen.getByText('Refund credit')).toBeInTheDocument();
    });
    expect(screen.getByText('Used on an order')).toBeInTheDocument();
  });

  it('shows the empty-state message when there are no transactions', async () => {
    render(<WalletPage />);
    await waitFor(() => {
      expect(screen.getByText(/No transactions yet/i)).toBeInTheDocument();
    });
  });

  it('surfaces balances stranded in other currencies after a store currency switch', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        balance: 30,
        currency: 'USD',
        transactions: [],
        allBalances: [
          { currency: 'USD', balance: 30 },
          { currency: 'EUR', balance: 20 },
        ],
      },
    });
    render(<WalletPage />);

    await waitFor(() => {
      expect(screen.getByTestId('other-currency-balances')).toBeInTheDocument();
    });
    expect(screen.getByTestId('other-currency-balances')).toHaveTextContent('20.00 EUR');
    expect(screen.getByTestId('other-currency-balances')).toHaveTextContent(/can't be spent at checkout/i);
  });

  it('does not show the other-currency note when there is nothing stranded', async () => {
    mockGet.mockResolvedValueOnce({
      data: { balance: 30, currency: 'USD', transactions: [], allBalances: [{ currency: 'USD', balance: 30 }] },
    });
    render(<WalletPage />);
    await waitFor(() => screen.getByTestId('credit-balance'));
    expect(screen.queryByTestId('other-currency-balances')).toBeNull();
  });

  it('submits a gift card code to the redeem endpoint', async () => {
    mockPost.mockResolvedValueOnce({
      data: { code: 'ABCD-1234-5678-90EF', availableBalance: 100, currency: 'USD' },
    });
    render(<WalletPage />);
    await waitFor(() => screen.getByTestId('gift-code-input'));
    fireEvent.change(screen.getByTestId('gift-code-input'), {
      target: { value: 'ABCD-1234-5678-90EF' },
    });
    fireEvent.click(screen.getByTestId('gift-redeem'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/gift-cards/ABCD-1234-5678-90EF/redeem',
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('gift-message-ok')).toHaveTextContent(/100.00 USD/);
    });
  });

  it('shows an error message when the redeem call fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('Card expired'));
    render(<WalletPage />);
    await waitFor(() => screen.getByTestId('gift-code-input'));
    fireEvent.change(screen.getByTestId('gift-code-input'), { target: { value: 'XXXX' } });
    fireEvent.click(screen.getByTestId('gift-redeem'));
    await waitFor(() => {
      expect(screen.getByTestId('gift-message-err')).toBeInTheDocument();
    });
  });

  it('disables the redeem button when the input is empty', async () => {
    render(<WalletPage />);
    await waitFor(() => screen.getByTestId('gift-code-input'));
    const btn = screen.getByTestId('gift-redeem') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
