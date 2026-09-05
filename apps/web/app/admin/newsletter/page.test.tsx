import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Page from './page';

vi.mock('@/lib/http', () => ({
  authHttp: {
    get: vi.fn(),
  },
  errorMessage: (e: unknown, f: string) => (e instanceof Error ? e.message : f),
}));

import { authHttp } from '@/lib/http';

describe('Admin newsletter page', () => {
  beforeEach(() => {
    vi.mocked(authHttp.get).mockResolvedValue({
      status: 'success',
      data: { count: 2, subscribers: ['a@x.com', 'b@x.com'] },
    } as any);
  });

  it('loads subscribers from GET /newsletter/subscribers', async () => {
    render(<Page />);
    await waitFor(() => expect(screen.getByText('a@x.com')).toBeTruthy());
    expect(authHttp.get).toHaveBeenCalledWith('/newsletter/subscribers');
    expect(screen.getByText('b@x.com')).toBeTruthy();
  });
});
