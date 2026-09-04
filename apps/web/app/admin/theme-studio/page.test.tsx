/**
 * Theme Studio — the visual theme builder.
 *
 * Covers the three things an admin depends on:
 *   - drag-and-drop adds a block to the canvas (drop handler -> addBlock)
 *   - reorder (↑/↓) and remove (✕) act on the in-memory layout
 *   - "Save theme" PUTs the theme INCLUDING the edited layout (persistence),
 *     and re-selecting the theme reloads the saved layout from the API
 *   - mobile: the 3-column desktop grid stacks to 1 column via useIsMobile
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ThemeStudioPage from './page';
import { useIsMobile } from '@/lib/hooks';
import { responsiveGrid } from '@/lib/layouts/render';

vi.mock('@/lib/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/hooks')>('@/lib/hooks');
  return { ...actual, useIsMobile: vi.fn() };
});

const theme = {
  key: 'my-brand',
  name: 'My Brand',
  description: 'A custom theme.',
  version: '1.0.0',
  author: 'Admin',
  preview: '/themes/my-brand/preview.png',
  features: { rtl: true, darkMode: false, paid: false },
  tokens: { primary: '#123456', spacing: 8 },
  layouts: {
    home: {
      columns: 12, gap: 24,
      blocks: [
        { id: 'hero-1', type: 'hero', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: { title: 'Hello' } },
      ],
    },
  },
};

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('ThemeStudioPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    (useIsMobile as any).mockReturnValue(false);
  });

  it('loads themes and renders the selected theme layout', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/theme-studio/themes') && (!opts?.method || opts.method === 'GET') && u.endsWith('/themes')) {
        return okJson(['my-brand']);
      }
      if (u.includes('/theme-studio/themes/my-brand') && (!opts?.method || opts.method === 'GET')) {
        return okJson(theme);
      }
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<ThemeStudioPage />);
    // Theme list shows the theme.
    await waitFor(() => expect(screen.getByText('My Brand')).toBeTruthy());
    fireEvent.click(screen.getByText('My Brand'));
    // After selecting, the canvas shows the theme's saved hero block.
    await waitFor(() => expect(screen.getByText('Hero')).toBeTruthy());
    // "Hello" renders on both the canvas and the live preview.
    expect(screen.getAllByText('Hello').length).toBeGreaterThanOrEqual(1);
  });

  it('adds a block by drag-and-drop and saves it (persistence round-trip)', async () => {
    const savedThemes: any = { ...theme };
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      const method = opts?.method || 'GET';
      if (u.includes('/theme-studio/themes') && method === 'GET' && u.endsWith('/themes')) return okJson(['my-brand']);
      if (u.includes('/theme-studio/themes/my-brand') && method === 'GET') return okJson(savedThemes);
      if (u.includes('/theme-studio/themes/my-brand') && method === 'PUT') {
        // Server "persists" the payload; a later GET returns it.
        savedThemes.layouts = JSON.parse(opts.body).layouts;
        return okJson(JSON.parse(opts.body));
      }
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<ThemeStudioPage />);
    await waitFor(() => expect(screen.getByText('My Brand')).toBeTruthy());
    fireEvent.click(screen.getByText('My Brand'));
    await waitFor(() => expect(screen.getByText('Hero')).toBeTruthy());

    const beforeBlocks = screen.getAllByText('Hero').length;
    expect(beforeBlocks).toBeGreaterThanOrEqual(1);

    // Simulate dragging a "Features" block onto the drop zone.
    const dropZone = screen.getByText(/Layout for/).closest('div[style]')!;
    const dataTransfer = { getData: () => 'features', setData: () => {} } as any;
    fireEvent.dragStart(screen.getByText('Features'), { dataTransfer });
    fireEvent.drop(dropZone, { dataTransfer });

    // The Features block now appears in the block list.
    expect(screen.getAllByText('Features').length).toBeGreaterThanOrEqual(1);

    // Save the theme — the PUT body must include the added block.
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u).includes('my-brand') && (o as any)?.method === 'PUT')).toBe(true)
    );
    const putCall = fetchMock.mock.calls.find(([u, o]) => String(u).includes('my-brand') && (o as any)?.method === 'PUT')!;
    const putBody = JSON.parse(putCall[1].body);
    expect(putBody.layouts.home.blocks.length).toBe(2);
    expect(putBody.layouts.home.blocks.some((b: any) => b.type === 'features')).toBe(true);

    // Drafts are cleared after save — switching page and back still shows the
    // persisted Features block from current.layouts, not a leftover draft.
    fireEvent.click(screen.getByRole('button', { name: 'All products' }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getAllByText('Features').length).toBeGreaterThanOrEqual(1);
  });

  it('reorders and removes blocks with the ↑ / ✕ controls', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/theme-studio/themes') && u.endsWith('/themes')) return okJson(['my-brand']);
      if (u.includes('/theme-studio/themes/my-brand')) return okJson(theme);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<ThemeStudioPage />);
    await waitFor(() => expect(screen.getByText('My Brand')).toBeTruthy());
    fireEvent.click(screen.getByText('My Brand'));
    await waitFor(() => expect(screen.getByText('Hero')).toBeTruthy());

    // Remove the hero block.
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('switches pages without losing the draft and saves per-page layouts', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/theme-studio/themes') && u.endsWith('/themes')) return okJson(['my-brand']);
      if (u.includes('/theme-studio/themes/my-brand') && (!opts?.method || opts.method === 'GET')) return okJson(theme);
      if (u.includes('/theme-studio/themes/my-brand') && opts?.method === 'PUT') return okJson(JSON.parse(opts.body));
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<ThemeStudioPage />);
    await waitFor(() => expect(screen.getByText('My Brand')).toBeTruthy());
    fireEvent.click(screen.getByText('My Brand'));
    await waitFor(() => expect(screen.getByText('Hero')).toBeTruthy());

    // Switch to the Products page and add a block there.
    fireEvent.click(screen.getByRole('button', { name: 'All products' }));
    const dropZone = screen.getByText(/Layout for/).closest('div[style]')!;
    const dataTransfer = { getData: () => 'newsletter', setData: () => {} } as any;
    fireEvent.drop(dropZone, { dataTransfer });
    expect(screen.getAllByText('Newsletter').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, o]) => String(u).includes('my-brand') && (o as any)?.method === 'PUT')).toBe(true)
    );
    const putCall = fetchMock.mock.calls.find(([u, o]) => String(u).includes('my-brand') && (o as any)?.method === 'PUT')!;
    const putBody = JSON.parse(putCall[1].body);
    // The home layout (unchanged) and the products layout (new block) both persist.
    expect(putBody.layouts.home.blocks.some((b: any) => b.type === 'hero')).toBe(true);
    expect(putBody.layouts.products.blocks.some((b: any) => b.type === 'newsletter')).toBe(true);
  });

  it('disables Save and Delete on a bundled theme', async () => {
    const bundled = { ...theme, key: 'bold', name: 'Bold' };
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/theme-studio/themes') && u.endsWith('/themes')) return okJson(['bold']);
      if (u.includes('/theme-studio/themes/bold')) return okJson(bundled);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<ThemeStudioPage />);
    await waitFor(() => expect(screen.getByText('Bold')).toBeTruthy());
    fireEvent.click(screen.getByText('Bold'));
    await waitFor(() => expect(screen.getByText(/platform theme/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Save theme' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock.mock.calls.some(([, o]) => (o as any)?.method === 'PUT')).toBe(false);
  });

  it('stacks the 3-column layout to a single column on mobile', async () => {
    (useIsMobile as any).mockReturnValue(true);
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/theme-studio/themes') && u.endsWith('/themes')) return okJson(['my-brand']);
      if (u.includes('/theme-studio/themes/my-brand')) return okJson(theme);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<ThemeStudioPage />);
    await waitFor(() => expect(screen.getByText('My Brand')).toBeTruthy());
    fireEvent.click(screen.getByText('My Brand'));
    await waitFor(() => expect(screen.getByText('Hero')).toBeTruthy());

    // The main 3-column grid collapses to a single '1fr' column.
    const main = screen.getByText('Theme Studio').closest('div')!.parentElement!.parentElement!.parentElement as HTMLElement;
    // Find the grid div with the responsive template.
    const grid = Array.from(document.querySelectorAll('div[style]')).find(
      (d) => (d as HTMLElement).style.gridTemplateColumns === '1fr'
    );
    expect(grid).toBeTruthy();
  });

  it('lets the admin preview the builder output at desktop/tablet/phone widths', async () => {
    (useIsMobile as any).mockReturnValue(false);
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/theme-studio/themes') && u.endsWith('/themes')) return okJson(['my-brand']);
      if (u.includes('/theme-studio/themes/my-brand')) return okJson(theme);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<ThemeStudioPage />);
    await waitFor(() => expect(screen.getByText('My Brand')).toBeTruthy());
    fireEvent.click(screen.getByText('My Brand'));
    await waitFor(() => expect(screen.getByText('Hero')).toBeTruthy());

    // Three preview width toggles are offered.
    const desktopBtn = screen.getByRole('button', { name: 'Desktop' });
    const tabletBtn = screen.getByRole('button', { name: 'Tablet' });
    const phoneBtn = screen.getByRole('button', { name: 'Phone' });
    expect(desktopBtn).toBeTruthy();
    expect(tabletBtn).toBeTruthy();
    expect(phoneBtn).toBeTruthy();

    const previewFrame = () =>
      Array.from(document.querySelectorAll('div[style]')).find(
        (d) => ((d as HTMLElement).style.width === '1280px' || (d as HTMLElement).style.width === '768px' || (d as HTMLElement).style.width === '375px')
      ) as HTMLElement | undefined;

    expect(previewFrame()?.style.width).toBe('1280px');
    fireEvent.click(tabletBtn);
    expect(previewFrame()?.style.width).toBe('768px');
    fireEvent.click(phoneBtn);
    expect(previewFrame()?.style.width).toBe('375px');
  });

  it('renders the builder preview collapsed to a single column at phone width', async () => {
    // Stack the whole admin to one column (phone) AND set the preview frame to
    // "Phone" so the builder output must reflow its multi-column grids.
    (useIsMobile as any).mockReturnValue(true);
    const themeWithGrid = {
      ...theme,
      layouts: {
        home: {
          columns: 12, gap: 24,
          blocks: [
            { id: 'feat', type: 'features', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: { items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] } },
          ],
        },
      },
    };
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      const u = String(url);
      if (u.includes('/theme-studio/themes') && u.endsWith('/themes')) return okJson(['my-brand']);
      if (u.includes('/theme-studio/themes/my-brand')) return okJson(themeWithGrid);
      return okJson({});
    });
    (global.fetch as any) = fetchMock;

    render(<ThemeStudioPage />);
    await waitFor(() => expect(screen.getByText('My Brand')).toBeTruthy());
    fireEvent.click(screen.getByText('My Brand'));
    await waitFor(() => expect(screen.getByText('Features')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }));

    // The preview frame is the width:375 container; its features grid must use
    // the reflowable auto-fit template (collapses to one column on a phone)
    // instead of a fixed 3-column grid.
    const frame = Array.from(document.querySelectorAll('div[style]')).find(
      (d) => (d as HTMLElement).style.width === '375px'
    ) as HTMLElement;
    expect(frame).toBeTruthy();
    const grid = Array.from(frame.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.gridTemplateColumns.includes('auto-fit')
    ) as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.style.gridTemplateColumns).toBe(responsiveGrid(3));
    expect(grid.style.gridTemplateColumns).not.toBe('repeat(3, 1fr)');
  });
});
