/**
 * AdminCategoriesPage - mobile responsiveness.
 *
 * The category form has a 1fr/1fr row (sort order + active) and a
 * 500px-wide modal. On a 360px phone the modal clips off the right
 * edge, and the sort-order / active checkbox row gets squeezed.
 * Stack under 640px and make the modal near-full-width.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminCategoriesPage from './page';
import { setNextRouter } from '@/test/setup-components';

const hoisted = vi.hoisted(() => ({
  isMobile: false,
}));

vi.mock('@/lib/hooks', () => ({
  useIsMobile: () => hoisted.isMobile,
}));

vi.mock('@/lib/http', () => ({
  http: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  authHttp: { get: vi.fn().mockResolvedValue({ data: [] }), post: vi.fn().mockResolvedValue({ data: { id: 'c1' } }), put: vi.fn().mockResolvedValue({ data: {} }), delete: vi.fn() },
  errorMessage: (e: any) => e?.message || 'error',
}));

beforeEach(() => {
  setNextRouter({ pathname: '/admin/categories' });
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ role: 'admin', firstName: 'Admin' }));
  hoisted.isMobile = false;
});

afterEach(() => {
  localStorage.clear();
});

describe('AdminCategoriesPage - form', () => {
  it('uses a two-column grid at desktop for the sort-order / active row', async () => {
    hoisted.isMobile = false;
    render(<AdminCategoriesPage />);
    // Open the form.
    const addButton = await screen.findByText(/Add Category|Add New Category|\+ Add/i);
    fireEvent.click(addButton);
    // The Sort Order input is type=number. The grid that wraps it is
    // the row that contains both Sort Order and the Active checkbox.
    const sortInput = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(sortInput).toBeInTheDocument();
    // grid row = input > field div > grid row.
    const gridRow = sortInput.parentElement?.parentElement as HTMLElement;
    expect(gridRow.style.gridTemplateColumns).toBe('1fr 1fr');
  });

  it('stacks the sort-order / active row to a single column on mobile', async () => {
    hoisted.isMobile = true;
    render(<AdminCategoriesPage />);
    const addButton = await screen.findByText(/Add Category|Add New Category|\+ Add/i);
    fireEvent.click(addButton);
    const sortInput = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    const gridRow = sortInput.parentElement?.parentElement as HTMLElement;
    expect(gridRow.style.gridTemplateColumns).toBe('1fr');
  });
});
