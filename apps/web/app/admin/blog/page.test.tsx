/**
 * Admin → Blog — list view tests.
 *
 * Same pattern as the pages index test: load, render, search,
 * filter, delete.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminBlogPage from './page';

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

const samplePosts = [
  {
    id: 'b1', slug: 'how-to-fit', title: 'How to find your fit',
    status: 'published', isFeatured: true, author: 'Alice',
    publishedAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'b2', slug: 'wip', title: 'WIP post',
    status: 'draft', isFeatured: false, author: null,
    publishedAt: null,
    updatedAt: '2026-02-01T09:00:00Z',
  },
];

beforeEach(() => {
  hoisted.get.mockReset();
  hoisted.delete.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('Admin → Blog: list', () => {
  it('renders the posts from the API', async () => {
    hoisted.get.mockResolvedValue({ data: samplePosts });
    render(<AdminBlogPage />);
    await waitFor(() =>
      expect(screen.getByText('How to find your fit')).toBeInTheDocument(),
    );
    expect(screen.getByText('WIP post')).toBeInTheDocument();
  });

  it('filters by status (published vs draft)', async () => {
    hoisted.get.mockResolvedValue({ data: samplePosts });
    render(<AdminBlogPage />);
    const draftFilter = await screen.findByTestId('admin-blog-filter-draft');
    fireEvent.click(draftFilter);
    await waitFor(() => {
      expect(screen.queryByText('How to find your fit')).toBeNull();
    });
    expect(screen.getByText('WIP post')).toBeInTheDocument();
  });

  it('renders the empty state when no posts match', async () => {
    hoisted.get.mockResolvedValue({ data: [] });
    render(<AdminBlogPage />);
    expect(
      await screen.findByText(/no posts yet/i),
    ).toBeInTheDocument();
  });

  it('shows a star for featured posts', async () => {
    hoisted.get.mockResolvedValue({ data: samplePosts });
    render(<AdminBlogPage />);
    await screen.findByText('How to find your fit');
    // The first row is featured (★ in gold); the second is
    // not. Pin the assertion to a specific row by reading
    // the parent's text content.
    const featuredRow = screen.getByText('How to find your fit').closest('tr');
    expect(featuredRow?.textContent).toContain('★');
  });
});
