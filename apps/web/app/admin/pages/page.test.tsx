/**
 * Admin → Pages — list view tests.
 *
 * The list is intentionally small: it loads pages, lets the
 * admin search and delete, and links to the editor at
 * /admin/pages/<id>/edit. Most of the editor behaviour is
 * covered by CmsEditor.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminPagesPage from './page';

const hoisted = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  API_BASE: 'http://api.local/api',
  authHttp: {
    get: (...args: unknown[]) => hoisted.get(...args),
    delete: (...args: unknown[]) => hoisted.delete(...args),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

const samplePages = [
  {
    id: 'p1',
    slug: 'about-us',
    pageType: 'info',
    title: 'About Us',
    status: 'published',
    showInFooter: true,
    sortOrder: 0,
    updatedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'p2',
    slug: 'privacy',
    pageType: 'legal',
    title: 'Privacy Policy',
    status: 'published',
    showInFooter: true,
    sortOrder: 0,
    updatedAt: '2026-02-01T09:00:00Z',
  },
  {
    id: 'p3',
    slug: 'shipping-draft',
    pageType: 'help',
    title: 'Shipping (WIP)',
    status: 'draft',
    showInFooter: false,
    sortOrder: 0,
    updatedAt: '2026-02-10T11:00:00Z',
  },
];

beforeEach(() => {
  hoisted.get.mockReset();
  hoisted.delete.mockReset();
  // happy-dom: stub confirm() to auto-accept.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Admin → Pages: list', () => {
  it('renders the pages from the API', async () => {
    hoisted.get.mockResolvedValue({ data: samplePages });
    render(<AdminPagesPage />);
    await waitFor(() =>
      expect(screen.getByText('About Us')).toBeInTheDocument(),
    );
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('shows a "+ New page" link to the editor', async () => {
    hoisted.get.mockResolvedValue({ data: samplePages });
    render(<AdminPagesPage />);
    const link = await screen.findByTestId('admin-pages-new');
    expect(link.getAttribute('href')).toBe('/admin/pages/new');
  });

  it('shows the right type chip per page', async () => {
    hoisted.get.mockResolvedValue({ data: samplePages });
    render(<AdminPagesPage />);
    const chips = await screen.findAllByTestId('page-type-chip');
    const values = chips.map((c) => c.textContent);
    expect(values).toEqual(['info', 'legal', 'help']);
  });

  it('filters by search query (title or slug)', async () => {
    hoisted.get.mockResolvedValue({ data: samplePages });
    render(<AdminPagesPage />);
    const search = await screen.findByTestId('admin-pages-search');
    fireEvent.change(search, { target: { value: 'privacy' } });
    await waitFor(() => {
      expect(screen.queryByText('About Us')).toBeNull();
    });
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('renders the empty state when there are no pages', async () => {
    hoisted.get.mockResolvedValue({ data: [] });
    render(<AdminPagesPage />);
    expect(
      await screen.findByText(/no pages yet/i),
    ).toBeInTheDocument();
  });

  it('shows the load error if the API fails', async () => {
    hoisted.get.mockRejectedValue(new Error('503 Service Unavailable'));
    render(<AdminPagesPage />);
    // errorMessage() normalises any thrown value into a
    // user-facing string. A plain Error falls back to the
    // default ("Could not load pages."); an ApiError with a
    // message would surface that instead. Either is fine; we
    // assert the user sees a meaningful banner.
    expect(
      await screen.findByText(/could not load pages/i),
    ).toBeInTheDocument();
  });

  it('deletes a page on confirm and removes the row from the list', async () => {
    hoisted.get.mockResolvedValue({ data: samplePages });
    hoisted.delete.mockResolvedValue({ data: {} });
    render(<AdminPagesPage />);
    await screen.findByText('About Us');
    const deleteBtn = screen.getByTestId('page-delete-about-us');
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(hoisted.delete).toHaveBeenCalledWith('/pages/p1'));
    await waitFor(() => expect(screen.queryByText('About Us')).toBeNull());
  });
});
