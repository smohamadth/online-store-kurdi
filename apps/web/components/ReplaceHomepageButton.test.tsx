import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReplaceHomepageButton from './ReplaceHomepageButton';

const rows = [{ id: 'new-1', type: 'cta', key: 'new', title: 'New home', config: {}, isVisible: true, sortOrder: 10 }];
const ok = () => ({ ok: true, status: 200, json: async () => ({ data: rows, message: 'Homepage replaced. Appearance settings were not changed.' }) });

describe('ReplaceHomepageButton', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'admin-token');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = vi.fn(async () => ok()) as any;
  });

  it('confirms the saved template, replaces only home sections and reports success', async () => {
    const onApplied = vi.fn();
    const onBusyChange = vi.fn();
    render(<ReplaceHomepageButton themeKey="my-brand" themeName="My Brand" onApplied={onApplied} onBusyChange={onBusyChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace homepage from theme' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/saved home template.*My Brand.*blocks will be deleted.*does not change/));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(rows));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/home-sections/apply-theme');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ themeKey: 'my-brand' });
    expect(init?.headers).toHaveProperty('Authorization', 'Bearer admin-token');
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByRole('status')).toHaveTextContent('Appearance settings were not changed');
  });

  it('does nothing when cancelled or disabled for unsaved edits', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const { rerender } = render(<ReplaceHomepageButton />);
    fireEvent.click(screen.getByRole('button'));
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockClear();
    rerender(<ReplaceHomepageButton disabled disabledReason="Save theme edits first." />);
    fireEvent.click(screen.getByRole('button'));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Save theme edits first.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the saved active theme when no explicit source was given', async () => {
    render(<ReplaceHomepageButton />);
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('status');
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({});
  });

  it('prevents repeated destructive requests while one is in flight', async () => {
    let resolve!: (value: any) => void;
    global.fetch = vi.fn(() => new Promise((r) => { resolve = r; })) as any;
    render(<ReplaceHomepageButton />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    resolve(ok());
    await screen.findByRole('status');
    expect(button).toBeEnabled();
  });

  it.each(['api', 'network'])('keeps the editor state on a %s failure and allows retry', async (kind) => {
    const onApplied = vi.fn();
    global.fetch = vi.fn(async () => {
      if (kind === 'network') throw new Error('offline');
      return { ok: false, status: 400, json: async () => ({ message: 'This theme has no saved homepage template.' }) };
    }) as any;
    render(<ReplaceHomepageButton onApplied={onApplied} />);
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('alert');
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
