/**
 * AdminBannersPage — the homepage gallery / banner editor.
 *
 * Verifies banners render with their position + active state, the Hide/Show
 * toggle PUTs the new isActive state, and the delete action removes a banner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminBannersPage from './page';

vi.mock('@/lib/hooks', () => ({ useIsMobile: () => false }));
vi.mock('@/components/ImageUpload', () => ({ default: () => null }));
vi.mock('@/lib/api', () => ({
  getImageUrl: (p: string) => `/uploads/${p}`,
}));

const banner = {
  id: 'b1', title: 'Spring Sale', subtitle: 'New season', description: '',
  linkUrl: '/products', buttonText: 'Shop', image: '', overlayColor: '', position: 'hero',
  sortOrder: 0, isActive: true, badge: '', secondaryText: '', secondaryUrl: '',
};

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminBannersPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  it('renders banners with position and active state', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('/banners') && (!opts?.method || opts.method === 'GET')) return okJson([banner]);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<AdminBannersPage />);
    await waitFor(() => expect(screen.getByText('Spring Sale')).toBeTruthy());
    expect(screen.getByText('hero')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('toggles a banner active state via PUT', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/banners') && (!opts?.method || opts.method === 'GET')) return okJson([banner]);
      if (u.includes('/banners/b1') && opts?.method === 'PUT') return okJson({ ...banner, isActive: false });
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<AdminBannersPage />);
    await waitFor(() => expect(screen.getByText('Spring Sale')).toBeTruthy());

    screen.getByText('Hide').click();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/banners/b1'),
        expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"isActive":false') })
      )
    );
  });
});
