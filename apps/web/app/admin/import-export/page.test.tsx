/**
 * AdminImportExportPage - the bulk import/export admin page.
 *
 * Behaviour covered:
 *   - entity (products/categories) and format (CSV/JSON) switching
 *   - preview flow: posts to /import-export/preview and renders the
 *     per-row classification (create / update / error)
 *   - commit flow: success banner on a clean file, failure banner with
 *     the per-row errors when the file is rejected (all-or-nothing)
 *   - export: fetches the file with the bearer token and triggers a
 *     browser download using the server's filename
 *   - template: pasted into the textarea; file input loads file text
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminImportExportPage from './page';
import { setNextRouter } from '@/test/setup-components';

const previewData = {
  entity: 'products',
  total: 2,
  summary: { create: 1, update: 1, error: 0 },
  rows: [
    { row: 1, status: 'create', sku: 'NEW-1', name: 'New One', errors: [] },
    { row: 2, status: 'update', sku: 'OLD-1', name: 'Old One', errors: [] },
  ],
};
const failingPreviewData = {
  entity: 'products',
  total: 1,
  summary: { create: 0, update: 0, error: 1 },
  rows: [{ row: 1, status: 'error', sku: 'BAD-1', name: 'Bad', errors: ['price: expected a number, got "abc"'] }],
};
const commitOk = { entity: 'products', total: 2, created: 1, updated: 1, failed: 0, errors: [] };
const commitFail = {
  entity: 'products',
  total: 2,
  created: 0,
  updated: 0,
  failed: 1,
  errors: [{ row: 2, sku: 'N-1', name: 'No Category', errors: ['category "Does Not Exist" not found'] }],
};

vi.mock('@/lib/http', () => ({
  API_BASE: 'http://api.test',
  getToken: () => 'test-token',
  authHttp: { post: vi.fn() },
  errorMessage: (e: any, f?: string) => (e instanceof Error ? e.message : e) || f || 'error',
}));

import { authHttp } from '@/lib/http';

const post = vi.mocked(authHttp.post);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createObjectURL: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let revokeObjectURL: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchMock: any;

beforeEach(() => {
  setNextRouter({ pathname: '/admin/import-export' });
  post.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  createObjectURL = vi.fn(() => 'blob:mock-url');
  revokeObjectURL = vi.fn();
  // happy-dom's static URL helpers, if present, get swapped; if not, defined.
  (URL as any).createObjectURL = createObjectURL;
  (URL as any).revokeObjectURL = revokeObjectURL;
  localStorage.setItem('token', 'test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const csvText = 'name,sku,price\nNew One,NEW-1,5\nOld One,OLD-1,6';

describe('AdminImportExportPage - controls', () => {
  it('renders entity tabs, format buttons and the export/import actions', () => {
    render(<AdminImportExportPage />);
    expect(screen.getByTestId('ie-entity-products')).toBeInTheDocument();
    expect(screen.getByTestId('ie-entity-categories')).toBeInTheDocument();
    expect(screen.getByTestId('ie-format-csv')).toBeInTheDocument();
    expect(screen.getByTestId('ie-format-json')).toBeInTheDocument();
    expect(screen.getByTestId('ie-export')).toBeInTheDocument();
    expect(screen.getByTestId('ie-export-template')).toBeInTheDocument();
    expect(screen.getByTestId('ie-file')).toBeInTheDocument();
    expect(screen.getByTestId('ie-text')).toBeInTheDocument();
    // Import actions are disabled until there is content.
    expect(screen.getByTestId('ie-preview')).toBeDisabled();
    expect(screen.getByTestId('ie-commit')).toBeDisabled();
  });

  it('switches the active entity and clears any preview', async () => {
    post.mockResolvedValue({ status: 'success', data: previewData });
    render(<AdminImportExportPage />);
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: csvText } });
    fireEvent.click(screen.getByTestId('ie-preview'));
    await screen.findByTestId('ie-summary');

    fireEvent.click(screen.getByTestId('ie-entity-categories'));
    await waitFor(() => expect(screen.queryByTestId('ie-summary')).not.toBeInTheDocument());
    // the categories tab now carries the primary style (same background as
    // the always-primary export button), products carries the secondary one
    const exportBtn = screen.getByTestId('ie-export') as HTMLButtonElement;
    const catTab = screen.getByTestId('ie-entity-categories') as HTMLButtonElement;
    const prodTab = screen.getByTestId('ie-entity-products') as HTMLButtonElement;
    expect(catTab.style.background).toBe(exportBtn.style.background);
    expect(prodTab.style.background).not.toBe(exportBtn.style.background);
  });
});

describe('AdminImportExportPage - preview', () => {
  it('posts the file text and renders the per-row classification', async () => {
    post.mockResolvedValue({ status: 'success', data: previewData });
    render(<AdminImportExportPage />);
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: csvText } });
    fireEvent.click(screen.getByTestId('ie-preview'));

    await screen.findByTestId('ie-summary');
    expect(post).toHaveBeenCalledWith('/import-export/preview', {
      entity: 'products',
      format: 'csv',
      text: csvText,
    });
    expect(screen.getByTestId('ie-summary')).toHaveTextContent('1 to create');
    expect(screen.getByTestId('ie-summary')).toHaveTextContent('1 to update');

    const rows = screen.getByTestId('ie-preview-rows');
    const bodyRows = within(rows as HTMLElement).getAllByRole('row');
    expect(bodyRows[0]).toHaveTextContent('New One');
    expect(bodyRows[0]).toHaveTextContent('NEW-1');
    expect(bodyRows[0]).toHaveTextContent('Create');
    expect(bodyRows[1]).toHaveTextContent('Old One');
    expect(bodyRows[1]).toHaveTextContent('Update');
  });

  it('shows the row errors and the all-or-nothing warning on a failing preview', async () => {
    post.mockResolvedValue({ status: 'success', data: failingPreviewData });
    render(<AdminImportExportPage />);
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: 'name,sku,price\nBad,BAD-1,abc' } });
    fireEvent.click(screen.getByTestId('ie-preview'));

    await screen.findByTestId('ie-summary');
    expect(screen.getByTestId('ie-summary')).toHaveTextContent('1 error');
    expect(screen.getByTestId('ie-preview-rows')).toHaveTextContent('price: expected a number');
    expect(screen.getByText(/commits nothing/i)).toBeInTheDocument();
  });

  it('surfaces an API error instead of crashing', async () => {
    post.mockRejectedValue(new Error('File is too large (max 1000000 characters)'));
    render(<AdminImportExportPage />);
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: csvText } });
    fireEvent.click(screen.getByTestId('ie-preview'));

    await screen.findByTestId('ie-error');
    expect(screen.getByTestId('ie-error')).toHaveTextContent('File is too large');
  });
});

describe('AdminImportExportPage - commit', () => {
  it('shows the success banner and clears the editor on a clean import', async () => {
    post.mockResolvedValue({ status: 'success', data: commitOk });
    render(<AdminImportExportPage />);
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: csvText } });
    fireEvent.click(screen.getByTestId('ie-commit'));

    const result = await screen.findByTestId('ie-commit-result');
    expect(result).toHaveTextContent('Imported 2 products: 1 created, 1 updated');
    expect(post).toHaveBeenCalledWith('/import-export/commit', { entity: 'products', format: 'csv', text: csvText });
    // editor cleared so the same file is not imported twice by accident
    expect((screen.getByTestId('ie-text') as HTMLTextAreaElement).value).toBe('');
  });

  it('shows the failure banner with row details when the file is rejected', async () => {
    post.mockResolvedValue({ status: 'success', data: commitFail });
    render(<AdminImportExportPage />);
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: csvText } });
    fireEvent.click(screen.getByTestId('ie-commit'));

    const result = await screen.findByTestId('ie-commit-result');
    expect(result).toHaveTextContent('Import failed');
    expect(result).toHaveTextContent('Row 2 (N-1)');
    expect(result).toHaveTextContent('category "Does Not Exist" not found');
    // editor kept so the admin can fix the file and retry
    expect((screen.getByTestId('ie-text') as HTMLTextAreaElement).value).toBe(csvText);
  });
});

describe('AdminImportExportPage - export', () => {
  it('downloads the export with the bearer token and the server filename', async () => {
    const csvBody = 'name,sku\nA,a\n';
    fetchMock.mockResolvedValue(
      new Response(csvBody, {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="products-export-20260101.csv"' },
      }),
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<AdminImportExportPage />);
    fireEvent.click(screen.getByTestId('ie-export'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/import-export/export/products?format=csv');
    expect((init?.headers as any).Authorization).toBe('Bearer test-token');
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('uses the template flag and JSON format when selected', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="categories-template-20260101.json"' },
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<AdminImportExportPage />);
    fireEvent.click(screen.getByTestId('ie-entity-categories'));
    fireEvent.click(screen.getByTestId('ie-format-json'));
    fireEvent.click(screen.getByTestId('ie-export-template'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/import-export/export/categories?format=json&sample=1');
  });

  it('shows the server message when the export fails', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Insufficient permissions' }), { status: 403 }));
    render(<AdminImportExportPage />);
    fireEvent.click(screen.getByTestId('ie-export'));

    await screen.findByTestId('ie-error');
    expect(screen.getByTestId('ie-error')).toHaveTextContent('Insufficient permissions');
  });

  it('pastes the one-row template into the textarea', async () => {
    const template = 'name,sku,slug\nSample Product,SKU-0001,\n';
    fetchMock.mockResolvedValue(new Response(template, { status: 200 }));
    render(<AdminImportExportPage />);
    fireEvent.click(screen.getByTestId('ie-load-template'));

    await waitFor(() => expect((screen.getByTestId('ie-text') as HTMLTextAreaElement).value).toBe(template));
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/import-export/export/products?format=csv&sample=1');
  });
});

describe('AdminImportExportPage - file input', () => {
  it('loads the selected file into the editor', async () => {
    render(<AdminImportExportPage />);
    const file = new File([csvText], 'products.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByTestId('ie-file'), { target: { files: [file] } });

    await waitFor(() => expect((screen.getByTestId('ie-text') as HTMLTextAreaElement).value).toBe(csvText));
  });
});

describe('AdminImportExportPage - customers & orders', () => {
  it('renders entity tabs for customers and orders', () => {
    render(<AdminImportExportPage />);
    expect(screen.getByTestId('ie-entity-customers')).toBeInTheDocument();
    expect(screen.getByTestId('ie-entity-orders')).toBeInTheDocument();
  });

  it('previews customers through the JSON endpoint', async () => {
    post.mockResolvedValue({
      status: 'success',
      data: {
        entity: 'customers',
        total: 1,
        summary: { create: 1, update: 0, error: 0 },
        rows: [{ row: 1, status: 'create', name: 'Jane', sku: 'jane@example.com', errors: [] }],
      },
    });
    render(<AdminImportExportPage />);
    fireEvent.click(screen.getByTestId('ie-entity-customers'));
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: 'email,firstName\njane@example.com,Jane' } });
    fireEvent.click(screen.getByTestId('ie-preview'));

    await screen.findByTestId('ie-summary');
    expect(post).toHaveBeenCalledWith('/import-export/preview', {
      entity: 'customers',
      format: 'csv',
      text: 'email,firstName\njane@example.com,Jane',
    });
    // the customer email is shown in the preview table
    expect(screen.getByTestId('ie-preview-rows')).toHaveTextContent('jane@example.com');
  });

  it('orders entity hides the image upload (products only)', () => {
    render(<AdminImportExportPage />);
    expect(screen.getByTestId('ie-images-label')).toBeInTheDocument(); // products default
    fireEvent.click(screen.getByTestId('ie-entity-orders'));
    expect(screen.queryByTestId('ie-images-label')).not.toBeInTheDocument();
  });
});

describe('AdminImportExportPage - product image upload', () => {
  it('sends a multipart request to /import-export/import when images are attached', async () => {
    post.mockResolvedValue({ status: 'success', data: previewData });
    render(<AdminImportExportPage />);
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: csvText } });
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('ie-images'), { target: { files: [file] } });
    expect(screen.getByTestId('ie-images-count')).toHaveTextContent('1 image attached');

    const imagePreview = {
      entity: 'products',
      total: 1,
      summary: { create: 1, update: 0, error: 0 },
      rows: [{ row: 1, status: 'create', sku: 'NEW-1', name: 'New One', errors: [] }],
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: imagePreview }), { status: 200 }));
    fireEvent.click(screen.getByTestId('ie-preview'));

    await screen.findByTestId('ie-summary');
    // images attached -> multipart via fetch, not the JSON authHttp path
    expect(post).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/import-export/import');
    expect(init.method).toBe('POST');
    const fd = init.body as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('entity')).toBe('products');
    expect(fd.get('action')).toBe('preview');
    expect(fd.getAll('images')).toHaveLength(1);
  });

  it('still uses the JSON endpoint for products with no attached images', async () => {
    post.mockResolvedValue({ status: 'success', data: previewData });
    render(<AdminImportExportPage />);
    fireEvent.change(screen.getByTestId('ie-text'), { target: { value: csvText } });
    fireEvent.click(screen.getByTestId('ie-preview'));

    await screen.findByTestId('ie-summary');
    expect(post).toHaveBeenCalledWith('/import-export/preview', { entity: 'products', format: 'csv', text: csvText });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
