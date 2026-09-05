import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Page from './page';

vi.mock('@/lib/http', () => ({
  authHttp: { get: vi.fn() },
  errorMessage: (e: unknown, f: string) => (e instanceof Error ? e.message : f),
}));

import { authHttp } from '@/lib/http';

describe('Admin contact inbox', () => {
  beforeEach(() => {
    vi.mocked(authHttp.get).mockResolvedValue({
      status: 'success',
      data: [
        {
          id: '1',
          name: 'Sam',
          email: 'sam@x.com',
          subject: 'Hello',
          message: 'Need help please.',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as any);
  });

  it('loads messages from GET /contact', async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText('Hello')).toBeTruthy());
    expect(authHttp.get).toHaveBeenCalledWith('/contact');
    expect(screen.getByText(/sam@x.com/)).toBeTruthy();
  });
});
