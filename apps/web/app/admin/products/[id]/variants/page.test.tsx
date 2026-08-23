/**
 * Component test for the admin product-variants page.
 *
 * The page talks to a backend that doesn't exist in the test
 * environment, so we mock the authHttp helpers and verify the
 * page renders the form, lists existing rows, and wires the
 * buttons. Heavy API behaviour is covered by the integration
 * tests; this one only pins the UI contract.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProductVariantsPage from './page';

// Mock next/navigation's useParams so we can return a product id.
const mockUseParams = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock authHttp so the page doesn't hit the network.
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();
vi.mock('@/lib/http', () => ({
  authHttp: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  errorMessage: (_err: unknown, fallback: string) => fallback,
}));

describe('Admin Product Variants page', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
    mockUseParams.mockReturnValue({ id: 'prod-123' });
    // Default: empty list
    mockGet.mockResolvedValue({ data: [] });
  });

  it('renders the page title and the new-variant button', async () => {
    render(<ProductVariantsPage />);
    await waitFor(() => {
      expect(screen.getByText('Product variants')).toBeInTheDocument();
    });
    expect(screen.getByTestId('new-variant')).toBeInTheDocument();
  });

  it('lists existing variants returned by the API', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          id: 'v1', productId: 'prod-123', name: 'Medium', sku: 'm-sku',
          price: 12.5, quantity: 5, isActive: true,
          attributes: { size: 'M', color: 'red' },
        },
      ],
    });
    render(<ProductVariantsPage />);
    await waitFor(() => {
      expect(screen.getByText('Medium')).toBeInTheDocument();
    });
    expect(screen.getByText('m-sku')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
  });

  it('opens the form when + New variant is clicked', async () => {
    render(<ProductVariantsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('new-variant')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('new-variant'));
    expect(screen.getByTestId('variant-form')).toBeInTheDocument();
    expect(screen.getByTestId('variant-name')).toBeInTheDocument();
    expect(screen.getByTestId('variant-sku')).toBeInTheDocument();
  });

  it('shows an empty-state row when no variants exist', async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    render(<ProductVariantsPage />);
    await waitFor(() => {
      expect(screen.getByText(/no variants yet/i)).toBeInTheDocument();
    });
  });

  it('validates price before submitting (rejects price <= 0)', async () => {
    render(<ProductVariantsPage />);
    await waitFor(() => screen.getByTestId('new-variant'));
    fireEvent.click(screen.getByTestId('new-variant'));
    fireEvent.change(screen.getByTestId('variant-name'), { target: { value: 'M' } });
    fireEvent.change(screen.getByTestId('variant-sku'), { target: { value: 'sku' } });
    fireEvent.change(screen.getByTestId('variant-price'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('variant-save'));
    await waitFor(() => {
      expect(screen.getByText(/price must be a positive number/i)).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits a create with parsed attributes when valid', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 'new' } });
    mockGet.mockResolvedValueOnce({ data: [] }); // initial load
    render(<ProductVariantsPage />);
    await waitFor(() => screen.getByTestId('new-variant'));
    fireEvent.click(screen.getByTestId('new-variant'));
    fireEvent.change(screen.getByTestId('variant-name'), { target: { value: 'Medium' } });
    fireEvent.change(screen.getByTestId('variant-sku'), { target: { value: 'sku-m' } });
    fireEvent.change(screen.getByTestId('variant-price'), { target: { value: '9.99' } });
    fireEvent.change(screen.getByTestId('variant-quantity'), { target: { value: '7' } });
    fireEvent.change(screen.getByTestId('variant-attributes'), {
      target: { value: 'size=M\ncolor=red' },
    });
    fireEvent.click(screen.getByTestId('variant-save'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/products/prod-123/variants',
        expect.objectContaining({
          name: 'Medium',
          sku: 'sku-m',
          price: 9.99,
          quantity: 7,
          attributes: { size: 'M', color: 'red' },
        }),
      );
    });
  });

  it('shows an error message when the API call fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('boom'));
    render(<ProductVariantsPage />);
    await waitFor(() => screen.getByTestId('new-variant'));
    fireEvent.click(screen.getByTestId('new-variant'));
    fireEvent.change(screen.getByTestId('variant-name'), { target: { value: 'M' } });
    fireEvent.change(screen.getByTestId('variant-sku'), { target: { value: 'sku-1' } });
    fireEvent.change(screen.getByTestId('variant-price'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('variant-save'));
    await waitFor(() => {
      // The errorMessage helper turns the Error into 'boom', and
      // the page wraps it with a fallback. The exact message
      // depends on the mock; just assert SOMETHING error-like
      // appeared.
      expect(screen.queryByText(/boom|could not save/i)).toBeInTheDocument();
    });
  });
});
