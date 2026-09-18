import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ThemeStudioPage from './page';
import { CartProvider } from '@/lib/store';
import { CompareProvider } from '@/lib/compare';
import { getDefaultTheme, type ThemeConfig } from '@/lib/themeRegistry';

const template = (): ThemeConfig => ({
  ...getDefaultTheme(), key: 'brand', name: 'Brand template',
  features: { rtl: false, darkMode: true, paid: false },
  layouts: { home: { columns: 12, gap: 24, blocks: [
    { id: 'first', type: 'cta', rowStart: 1, rowSpan: 1, colStart: 1, colSpan: 6, config: { title: 'First section' } },
    { id: 'second', type: 'quote', rowStart: 1, rowSpan: 1, colStart: 7, colSpan: 6, config: { text: 'Second section' } },
  ] } },
});

function api(themes = [template()], failure?: 'network' | 'server') {
  const records = new Map(themes.map((theme) => [theme.key, structuredClone(theme)]));
  const mock = vi.fn(async (url: any, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method || 'GET';
    const response = (data: unknown, status = 200, message?: string) => ({ ok: status < 400, status, json: async () => ({ data, message }) });
    if (path.endsWith('/theme-studio/themes')) return response(Array.from(records.values()));
    if (path.includes('/theme-studio/themes/')) {
      const key = path.split('/').pop()!;
      if (method === 'PUT') {
        if (failure === 'network') throw new Error('Connection lost');
        if (failure === 'server') return response(null, 400, 'Theme validation failed');
        const saved = JSON.parse(init!.body as string);
        saved.name = saved.name.trim(); // simulate the server returning normalised content
        records.set(key, saved);
        return response(saved);
      }
      if (method === 'DELETE') { records.delete(key); return response({}); }
      return records.has(key) ? response(records.get(key)) : response(null, 404);
    }
    if (path.endsWith('/home-sections/apply-theme')) return response([], 200, 'Homepage replaced.');
    return response(null, 404);
  });
  global.fetch = mock as any;
  return mock;
}

beforeEach(() => {
  localStorage.setItem('token', 'admin-token');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

async function open(name = 'Brand template') {
  render(<CompareProvider><CartProvider><ThemeStudioPage /></CartProvider></CompareProvider>);
  fireEvent.click(await screen.findByText(name));
  await screen.findByLabelText('Theme name');
}

describe('Studio save and replacement boundaries', () => {
  it('uses an ordered home template, but keeps grid controls on other pages', async () => {
    const mock = api();
    await open();
    expect(screen.queryByLabelText(/Columns:/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Col$/)).not.toBeInTheDocument();
    expect(screen.getAllByText('First section').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Move Quote up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await screen.findByText(/saved\. Homepage blocks were not changed/);
    const write = mock.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    const home = JSON.parse(write[1]!.body as string).layouts.home;
    expect(home.columns).toBe(1);
    expect(home.blocks.map((block: any) => block.id)).toEqual(['second', 'first']);
    expect(home.blocks.map((block: any) => block.rowStart)).toEqual([1, 2]);
    expect(mock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'All products' }));
    expect(screen.getByLabelText(/Columns:/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace homepage from theme' })).not.toBeInTheDocument();
  });

  it('blocks replacement after metadata-only edits and uses the server response after Save', async () => {
    api();
    await open();
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Theme name'), { target: { value: '  Renamed theme  ' } });
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Apply styling in Appearance' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await waitFor(() => expect(screen.getByLabelText('Theme name')).toHaveValue('Renamed theme'));
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Apply styling in Appearance' })).toHaveAttribute('href', '/admin/appearance?tab=theme&theme=brand');
  });

  it.each(['server', 'network'] as const)('preserves unsaved edits on a %s save failure and re-enables Save', async (failure) => {
    api([template()], failure);
    await open();
    fireEvent.change(screen.getByLabelText('Theme name'), { target: { value: 'Unsaved name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save theme' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Theme name')).toHaveValue('Unsaved name');
    expect(screen.getByRole('button', { name: 'Save theme' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeDisabled();
  });

  it('allows cancelling a theme switch without discarding any draft', async () => {
    const second = { ...template(), key: 'second-brand', name: 'Other template' };
    api([template(), second]);
    await open();
    fireEvent.change(screen.getByLabelText('Theme name'), { target: { value: 'Unsaved name' } });
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByText('Other template'));
    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved theme edits and switch themes?');
    expect(screen.getByLabelText('Theme name')).toHaveValue('Unsaved name');
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByText('Other template'));
    await waitFor(() => expect(screen.getByLabelText('Theme name')).toHaveValue('Other template'));
    expect(screen.getByRole('button', { name: 'Save theme' })).toBeDisabled();
  });

  it('duplicates all current page drafts, tokens, feature flags and section references', async () => {
    const bundled = { ...template(), key: 'bold', name: 'Bundled source', sections: { hero: 'themes/bold/sections/Hero' } };
    const mock = api([bundled]);
    await open('Bundled source');
    fireEvent.click(screen.getByTestId('palette-newsletter'));
    expect(screen.getByRole('button', { name: 'Save theme' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate theme' }));
    fireEvent.change(screen.getByLabelText('New theme name'), { target: { value: 'My copy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByLabelText('Theme name')).toHaveValue('My copy'));
    const write = mock.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(write[0]).toBe('/api/theme-studio/themes/my-copy');
    const saved = JSON.parse(write[1]!.body as string);
    expect(saved.layouts.home.blocks).toHaveLength(3);
    expect(saved.layouts.home.blocks[2].type).toBe('newsletter');
    expect(saved.features).toEqual(bundled.features);
    expect(saved.sections).toEqual(bundled.sections);
    expect(saved.tokens).toEqual(bundled.tokens);
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeEnabled();
  });

  it('refuses to overwrite an existing theme through Duplicate', async () => {
    const mock = api();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate theme' }));
    fireEvent.change(screen.getByLabelText('New theme name'), { target: { value: 'brand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(mock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });

  it('does not permit creation when the catalog could not load to check for existing keys', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ message: 'Catalog unavailable' }) })) as any;
    render(<CompareProvider><CartProvider><ThemeStudioPage /></CartProvider></CompareProvider>);
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '+ New theme' })).toBeDisabled();
  });

  it('never fills an absent home template with an unsaved default', async () => {
    api([{ ...template(), layouts: {} }]);
    await open();
    expect(screen.getByText('No blocks yet. Drag one from the palette.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeDisabled();
  });

  it('separates the saved storefront iframe from the Home editor draft and removes store-only token controls', async () => {
    api();
    await open();
    expect(screen.getByTitle('Saved storefront preview')).toHaveAttribute('src', '/?studioPreview=0');
    expect(screen.queryByLabelText('Announcement text')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Custom CSS')).not.toBeInTheDocument();
  });
});
