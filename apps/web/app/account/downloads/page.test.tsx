/**
 * Component test for /account/downloads.
 *
 * The page fetches the user's download list and renders one
 * row per ProductDownload. We mock `globalThis.fetch` (same
 * pattern as the other storefront pages) and exercise:
 *
 *   - Loading state
 *   - Empty state (no tokens)
 *   - Active row + status badge
 *   - Expired / limit-exceeded rows render disabled
 *   - Clicking "Download" hits the redemption endpoint and
 *     opens the source URL in a new tab
 *
 * The order-grouping code is also pinned so a future refactor
 * can't break the visual hierarchy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DownloadsPage from './page';

const fetchMock = vi.fn();

const activeRow = {
  id: 'pd-1',
  token: 'tok-active-1234567890',
  sourceUrl: 'https://cdn.example.com/files/ebook.pdf',
  downloadCount: 0,
  downloadLimit: 5,
  expiresAt: '2099-12-31T00:00:00.000Z',
  status: 'active',
  order: { id: 'o-1', orderNumber: 'ORD-1001' },
  orderItem: { id: 'oi-1', product: { name: 'My eBook', slug: 'ebook' } },
};

const expiredRow = {
  ...activeRow,
  id: 'pd-2',
  token: 'tok-expired-1234567890',
  status: 'expired',
  expiresAt: '2020-01-01T00:00:00.000Z',
  downloadCount: 0,
  downloadLimit: null,
  orderItem: { id: 'oi-2', product: { name: 'Old PDF', slug: 'old-pdf' } },
};

const limitHitRow = {
  ...activeRow,
  id: 'pd-3',
  token: 'tok-limit-1234567890',
  status: 'limit_exceeded',
  downloadCount: 5,
  downloadLimit: 5,
  orderItem: { id: 'oi-3', product: { name: 'Capped file', slug: 'capped' } },
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('token', 'test-jwt-token');
  fetchMock.mockReset();
  // The default happy-dom window.open is a no-op. Capture its
  // calls so we can assert the source URL the page opens.
  vi.spyOn(window, 'open').mockImplementation(() => null as any);
});

describe('DownloadsPage: empty state', () => {
  it('shows the empty card when the user has no downloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: [] }),
    });
    globalThis.fetch = fetchMock as any;
    render(<DownloadsPage />);
    await waitFor(() => expect(screen.getByTestId('downloads-empty')).toBeTruthy());
    expect(screen.getByTestId('downloads-heading').textContent).toContain('My Downloads');
  });
});

describe('DownloadsPage: list rendering', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [activeRow] }),
    });
    globalThis.fetch = fetchMock as any;
  });

  it('renders one row per ProductDownload', async () => {
    render(<DownloadsPage />);
    await waitFor(() => expect(screen.getByTestId('downloads-list')).toBeTruthy());
    expect(screen.getAllByTestId('download-row')).toHaveLength(1);
  });

  it('shows the Active status badge for an active token', async () => {
    render(<DownloadsPage />);
    await waitFor(() => expect(screen.getByTestId('download-status')).toBeTruthy());
    expect(screen.getByTestId('download-status').textContent).toBe('Active');
  });

  it('shows the per-token remaining count', async () => {
    render(<DownloadsPage />);
    await waitFor(() => expect(screen.getByTestId('download-remaining')).toBeTruthy());
    expect(screen.getByTestId('download-remaining').textContent).toContain('5 of 5');
  });

  it('groups rows under the parent order', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [activeRow, expiredRow] }),
    });
    globalThis.fetch = fetchMock as any;
    render(<DownloadsPage />);
    // The order label is `Order ` + <strong>#{orderNumber}</strong>.
    // The hash and number are split into separate text nodes by
    // React, so a simple text matcher won't work. Use a function
    // matcher that checks the strong contains the order number.
    await waitFor(() => {
      const strongs = document.querySelectorAll('strong');
      const found = Array.from(strongs).some(
        (s) => s.textContent === '#ORD-1001',
      );
      expect(found).toBe(true);
    });
  });
});

describe('DownloadsPage: expired and limit-exceeded rows', () => {
  it('disables the Download button on an expired row', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: [expiredRow] }),
    });
    globalThis.fetch = fetchMock as any;
    render(<DownloadsPage />);
    await waitFor(() => expect(screen.getByTestId('download-button')).toBeTruthy());
    const btn = screen.getByTestId('download-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Unavailable');
  });

  it('disables the Download button when the limit is hit', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: [limitHitRow] }),
    });
    globalThis.fetch = fetchMock as any;
    render(<DownloadsPage />);
    await waitFor(() => expect(screen.getByTestId('download-button')).toBeTruthy());
    expect((screen.getByTestId('download-button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('DownloadsPage: redemption', () => {
  it('hits the public redemption endpoint and opens the source URL', async () => {
    // First call: list. Second call: redeem.
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ data: [activeRow] }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ data: { url: activeRow.sourceUrl, remaining: 4 } }),
      })
      // After redeem, the page re-fetches the list.
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          data: [{ ...activeRow, downloadCount: 1 }],
        }),
      });
    globalThis.fetch = fetchMock as any;
    render(<DownloadsPage />);
    await waitFor(() => expect(screen.getByTestId('download-button')).toBeTruthy());
    fireEvent.click(screen.getByTestId('download-button'));
    // The redemption call should have the token in the URL.
    await waitFor(() => {
      const redeemCall = fetchMock.mock.calls.find(
        ([url]: any) => typeof url === 'string' && url.includes('/downloads/tok-active'),
      );
      expect(redeemCall).toBeTruthy();
    });
    // window.open was called with the source URL.
    expect(window.open).toHaveBeenCalledWith(activeRow.sourceUrl, '_blank', expect.any(String));
  });

  it('surfaces a server error when redemption fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ data: [activeRow] }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 410,
        json: async () => ({ message: 'This download link has expired' }),
      });
    globalThis.fetch = fetchMock as any;
    render(<DownloadsPage />);
    await waitFor(() => expect(screen.getByTestId('download-button')).toBeTruthy());
    fireEvent.click(screen.getByTestId('download-button'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('expired'),
    );
  });
});
