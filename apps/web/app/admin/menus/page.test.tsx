/**
 * AdminMenusPage — the navigation menu builder.
 *
 * Verifies the menu list renders, clicking a menu loads its items, and the
 * create-menu form POSTs a new menu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminMenusPage from './page';

const menu = {
  id: 'm1', name: 'Main', location: 'header', _count: { items: 2 },
  items: [
    { id: 'i1', label: 'Home', url: '/', parentId: null, sortOrder: 0, isActive: true, target: '_self', icon: null },
    { id: 'i2', label: 'Shop', url: '/products', parentId: null, sortOrder: 1, isActive: true, target: '_self', icon: null },
  ],
};

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminMenusPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  it('renders menus and loads items when a menu is selected', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u === '/api/menus' && (!opts?.method || opts.method === 'GET')) return okJson([menu]);
      if (u === '/api/menus/m1' && (!opts?.method || opts.method === 'GET')) return okJson(menu);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<AdminMenusPage />);
    await waitFor(() => expect(screen.getByText(/Main/)).toBeTruthy());
    expect(screen.getByText(/header • 2 items/)).toBeTruthy();

    screen.getByText(/Main/).click();
    await waitFor(() => expect(screen.getByText('Home')).toBeTruthy());
    expect(screen.getByText('Shop')).toBeTruthy();
  });

  it('creates a menu via the form', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u === '/api/menus' && (!opts?.method || opts.method === 'GET')) return okJson([]);
      if (u === '/api/menus' && opts?.method === 'POST') return okJson({ ...menu, id: 'm2', name: 'Footer' });
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<AdminMenusPage />);
    await waitFor(() => expect(screen.getByText('+ Create Menu')).toBeTruthy());
    screen.getByText('+ Create Menu').click();
    await waitFor(() => expect(screen.getByText('Create New Menu')).toBeTruthy());

    const form = document.querySelector('form')!;
    fireEvent.change(screen.getByPlaceholderText('e.g., Main Navigation'), { target: { value: 'Footer' } });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/menus',
        expect.objectContaining({ method: 'POST' })
      )
    );
    await waitFor(() => expect(screen.getByText('Menu created successfully!')).toBeTruthy());
  });
});
