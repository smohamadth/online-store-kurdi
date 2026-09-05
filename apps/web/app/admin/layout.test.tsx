/**
 * Admin layout — the admin shell + auth gate.
 *
 * Verifies the responsive shell:
 *   - desktop (wide viewport): the 260px sidebar is always visible inline
 *   - mobile (narrow viewport): a hamburger appears and tapping it opens the
 *     slide-in sidebar overlay
 *   - nav items render in both modes
 *
 * The layout's `useIsMobile` is a local hook reading `window.innerWidth`, so
 * we control the viewport directly. The auth gate calls /auth/me; fetch is
 * mocked to admit an admin so the shell renders its children.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminLayout from './layout';

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ role: 'admin', firstName: 'Ada', email: 'ada@store.com' }));
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/me')) return okJson({ role: 'admin', firstName: 'Ada', email: 'ada@store.com' });
      return okJson(null);
    });
    (global.fetch as any) = fetchMock;
  });

  it('renders the desktop sidebar inline on wide screens', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    render(<AdminLayout><div>Dashboard content</div></AdminLayout>);
    await waitFor(() => expect(screen.getByText('Welcome, Ada')).toBeTruthy());

    // Nav items visible, hamburger NOT present on desktop.
    expect(screen.getByText('Dashboard content')).toBeTruthy();
    expect(screen.getAllByText('Orders').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Languages').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Newsletter').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Currencies').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('☰')).toBeNull();
    expect(screen.getByDisplayValue('English')).toBeTruthy();
  });

  it('switches chrome to Persian from the language picker', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    render(<AdminLayout><div>Dashboard content</div></AdminLayout>);
    await waitFor(() => expect(screen.getByText('Welcome, Ada')).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue('English'), { target: { value: 'fa' } });
    expect(screen.getByText('خوش آمدید، Ada')).toBeTruthy();
    expect(screen.getAllByText('سفارش‌ها').length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector('[data-admin-shell]')?.getAttribute('dir')).toBe('rtl');
  });

  it('shows a hamburger and slides the sidebar open on mobile', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    render(<AdminLayout><div>Dashboard content</div></AdminLayout>);
    await waitFor(() => expect(screen.getAllByText('Ada').length).toBeGreaterThanOrEqual(1));

    // Hamburger present on mobile.
    const burger = screen.getByText('☰');
    expect(burger).toBeTruthy();

    // Tapping the hamburger opens the slide-in sidebar (nav becomes reachable).
    fireEvent.click(burger);
    await waitFor(() => {
      expect(screen.getAllByText('Orders').length).toBeGreaterThanOrEqual(1);
    });
  });
});
