import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AppearancePage from './page';
import { DEFAULT_THEME } from '@/lib/theme';
import { THEMES } from '@/lib/themeRegistry';
import { clearRuntimeThemeCache } from '@/lib/themeRuntime';
import type { HomeSection } from '@/lib/homeSections';

const home: HomeSection[] = [
  { id: 'one', key: 'story', type: 'richText', title: 'Our story', subtitle: null, config: { html: '<p>Original</p>' }, isVisible: true, sortOrder: 10 },
  { id: 'two', key: 'cta', type: 'cta', title: 'Shop now', subtitle: null, config: {}, isVisible: true, sortOrder: 20 },
];

function mockApi({ failLoad = false, failSave = false, failHomeOnce = false } = {}) {
  let saved = { ...DEFAULT_THEME, showFeatured: false, announcementText: 'Keep our message', customCss: '.brand { opacity: .9; }' };
  let rows = structuredClone(home);
  const fetchMock = vi.fn(async (url: any, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method || 'GET';
    const payload = init?.body ? JSON.parse(init.body as string) : {};
    const response = (data: unknown, status = 200, message?: string) => ({ ok: status < 400, status, json: async () => ({ data, message }) });
    if (path === '/api/themes') return response({ themes: THEMES, invalid: [] });
    if (path.endsWith('/theme') && method === 'GET') return response(saved, failLoad ? 503 : 200, failLoad ? 'Appearance unavailable' : undefined);
    if (path.endsWith('/theme') && method === 'PUT') {
      if (failSave) return response(null, 500, 'Could not save appearance');
      saved = { ...saved, ...payload };
      return response(saved);
    }
    if (path.endsWith('/home-sections') && method === 'GET') {
      if (failHomeOnce) { failHomeOnce = false; return response(null, 503, 'Homepage unavailable'); }
      return response(rows);
    }
    if (path.endsWith('/home-sections/reorder')) {
      rows = payload.order.map((id: string, i: number) => ({ ...rows.find((row) => row.id === id), sortOrder: (i + 1) * 10 }));
      return response(rows);
    }
    if (path.includes('/home-sections/') && method === 'PUT') {
      const id = path.split('/').pop();
      rows = rows.map((row) => row.id === id ? { ...row, ...payload } : row);
      return response(rows.find((row) => row.id === id));
    }
    return response(null, 404);
  });
  global.fetch = fetchMock as any;
  return fetchMock;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/appearance');
  sessionStorage.clear();
  clearRuntimeThemeCache();
  localStorage.setItem('token', 'admin-token');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { window.history.replaceState(null, '', '/'); });

async function open() {
  render(<AppearancePage />);
  await screen.findByRole('tab', { name: 'Homepage' });
}

describe('Appearance design workflow', () => {
  it('removes legacy Sections and keeps announcement visibility in one place', async () => {
    mockApi();
    await open();
    expect(screen.queryByRole('tab', { name: /Sections/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    fireEvent.click(screen.getByRole('tab', { name: 'Announcement' }));
    expect(screen.getByRole('checkbox', { name: 'Show the announcement bar' })).toBeInTheDocument();
    expect(screen.queryByText(/master switches/)).not.toBeInTheDocument();
    expect(screen.getByText('Style preview · sample content')).toBeInTheDocument();
  });

  it('separates the selected theme from the live theme until appearance is saved', async () => {
    const api = mockApi();
    await open();
    fireEvent.click(screen.getByTestId('theme-select-bold'));
    expect(screen.getByTestId('theme-card-default')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('theme-card-bold')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('selected-badge-bold')).toHaveTextContent('not saved');
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeDisabled();
    expect(api.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }));
    await screen.findByText(/Appearance saved\. Styling is live/);
    expect(screen.getByTestId('theme-card-bold')).toHaveAttribute('data-active', 'true');
    expect(screen.queryByTestId('selected-badge-bold')).not.toBeInTheDocument();
    const writes = api.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('/api/theme');
    const body = JSON.parse(writes[0][1]!.body as string);
    expect(body.activeTheme).toBe('bold');
    expect(body.primaryColor).toBe(THEMES.find((theme) => theme.key === 'bold')!.tokens.primaryColor);
    expect(body.announcementText).toBe('Keep our message');
    expect(body.customCss).toBe('.brand { opacity: .9; }');
    expect(body).not.toHaveProperty('showFeatured');
    expect(body).not.toHaveProperty('layouts');
    expect(api.mock.calls.some(([url]) => String(url).includes('/home-sections'))).toBe(false);
  });

  it('keeps a failed appearance save dirty and never changes the active badge', async () => {
    mockApi({ failSave: true });
    await open();
    fireEvent.click(screen.getByTestId('theme-select-bold'));
    fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }));
    await screen.findByRole('alert');
    expect(screen.getByTestId('theme-card-default')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('selected-badge-bold')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save appearance' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard appearance edits' }));
    expect(screen.queryByTestId('selected-badge-bold')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save appearance' })).toBeDisabled();
  });

  it('stages a Studio/preview deep-link choice without automatically publishing it', async () => {
    window.history.replaceState(null, '', '/admin/appearance?tab=theme&theme=bold');
    const api = mockApi();
    await open();
    await screen.findByTestId('selected-badge-bold');
    expect(api.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
    expect(screen.getByTestId('theme-card-default')).toHaveAttribute('data-active', 'true');
  });

  it('does not silently select a fallback for an unknown requested theme', async () => {
    window.history.replaceState(null, '', '/admin/appearance?theme=missing');
    mockApi();
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent('not available');
    expect(screen.getByRole('button', { name: 'Save appearance' })).toBeDisabled();
  });

  it('opens old Sections links in Homepage, with no misleading global save/reset', async () => {
    window.history.replaceState(null, '', '/admin/appearance?tab=sections');
    mockApi();
    await open();
    await screen.findByText('Our story');
    expect(screen.getByRole('tab', { name: 'Homepage' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Save appearance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset appearance' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show Our story' })).toBeChecked();
  });

  it('protects homepage drafts across tab changes and uses only the home API to save them', async () => {
    const api = mockApi();
    await open();
    fireEvent.click(screen.getByRole('tab', { name: 'Homepage' }));
    await screen.findByText('Our story');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByLabelText('Heading for story'), { target: { value: 'Our new story' } });
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeDisabled();
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Colours' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Discard unsaved homepage edits'));
    expect(screen.getByLabelText('Heading for story')).toHaveValue('Our new story');
    fireEvent.click(screen.getByRole('button', { name: 'Save this block' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeEnabled());
    const writes = api.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('/api/home-sections/one');
    expect(JSON.parse(writes[0][1]!.body as string).title).toBe('Our new story');
    vi.mocked(window.confirm).mockClear();
    fireEvent.click(screen.getByRole('tab', { name: 'Colours' }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('keeps draft wording when visibility or order is saved immediately', async () => {
    mockApi();
    await open();
    fireEvent.click(screen.getByRole('tab', { name: 'Homepage' }));
    await screen.findByText('Our story');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByLabelText('Heading for story'), { target: { value: 'Draft story' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Draft story' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Show Draft story' })).toBeEnabled());
    expect(screen.getByLabelText('Heading for story')).toHaveValue('Draft story');
    expect(screen.getByRole('checkbox', { name: 'Show Draft story' })).not.toBeChecked();
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save this block' })).toBeEnabled());
    expect(screen.getByLabelText('Heading for story')).toHaveValue('Draft story');
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeDisabled();
  });

  it('does not lose a deep-link selection to an abandoned Strict Mode load', async () => {
    window.history.replaceState(null, '', '/admin/appearance?theme=bold');
    const mock = mockApi();
    const respond = mock.getMockImplementation()!;
    let release!: (response: any) => void;
    let themeReads = 0;
    mock.mockImplementation((url, init) => {
      if (String(url).endsWith('/theme') && !init?.method && ++themeReads === 1) {
        return new Promise((resolve) => { release = resolve; });
      }
      return respond(url, init);
    });
    render(<StrictMode><AppearancePage /></StrictMode>);
    await screen.findByTestId('selected-badge-bold');
    await act(async () => { release({ ok: true, status: 200, json: async () => ({ data: DEFAULT_THEME }) }); });
    expect(screen.getByTestId('selected-badge-bold')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save appearance' })).toBeEnabled();
  });

  it('records exactly one undo step per block edit in Strict Mode', async () => {
    window.history.replaceState(null, '', '/admin/appearance?tab=home');
    mockApi();
    render(<StrictMode><AppearancePage /></StrictMode>);
    await screen.findByText('Our story');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByLabelText('Heading for story'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Heading for story')).toHaveValue('Our story');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeEnabled();
  });

  it('offers retry instead of an editable empty home after a load failure', async () => {
    window.history.replaceState(null, '', '/admin/appearance?tab=home');
    mockApi({ failHomeOnce: true });
    await open();
    await screen.findByRole('button', { name: 'Retry loading homepage' });
    expect(screen.queryByRole('button', { name: 'Replace homepage from theme' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading homepage' }));
    await screen.findByText('Our story');
    expect(screen.getByRole('button', { name: 'Replace homepage from theme' })).toBeEnabled();
  });

  it('never permits default appearance to overwrite a failed initial load', async () => {
    const api = mockApi({ failLoad: true });
    await open();
    expect(screen.getByText(/Settings not loaded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save appearance' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset appearance' })).toBeDisabled();
    expect(api.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
});
