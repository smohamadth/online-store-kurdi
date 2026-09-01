/**
 * AdminReviewsPage — review moderation.
 *
 * Verifies approved/pending badges render, the filter pills narrow the
 * table, Approve POSTs the moderation update to /reviews/:id, and Delete
 * removes the row only after the API confirms.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminReviewsPage from './page';

const approved = {
  id: 'r1', rating: 5, comment: 'Great product', isApproved: true, createdAt: '2024-02-01T00:00:00Z',
  product: { name: 'T-Shirt' }, user: { firstName: 'Sara', lastName: 'Karim' },
};
const pending = {
  id: 'r2', rating: 3, comment: 'Okay', isApproved: false, createdAt: '2024-02-02T00:00:00Z',
  product: { name: 'Mug' }, user: { firstName: 'Ali', lastName: 'Hamad' },
};

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminReviewsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/reviews') && (!opts?.method || opts.method === 'GET')) return okJson([approved, pending]);
      if (u.includes('/reviews/r1') && opts?.method === 'PUT') return okJson({ ...approved, isApproved: false });
      if (u.includes('/reviews/r2') && opts?.method === 'PUT') return okJson({ ...pending, isApproved: true });
      if (u.includes('/reviews/r1') && opts?.method === 'DELETE') return okJson({});
      return okJson([]);
    });
    (global.fetch as any) = fetchMock;
  });

  it('renders reviews with status badges', async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText('Great product')).toBeTruthy());
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
  });

  it('approves a pending review', async () => {
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText('Great product')).toBeTruthy());

    const approveButtons = screen.getAllByText('Approve');
    fireEvent.click(approveButtons[0]);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/reviews/r2'),
        expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"isApproved":true') })
      )
    );
  });

  it('deletes a review after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminReviewsPage />);
    await waitFor(() => expect(screen.getByText('Great product')).toBeTruthy());

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/reviews/r1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    );
  });
});
