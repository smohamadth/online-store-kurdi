/**
 * Developer reference page (/developers).
 *
 * The page must be LIVE from code: the endpoint catalog renders whatever
 * GET /api/developers returns (mocked here), the hero options section
 * renders the actual exported constants/normaliser from lib/heroOptions,
 * and the section types come from lib/homeSections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DevelopersPage from './DevelopersPage';
import { HERO_HEIGHT_PX } from '@/lib/heroOptions';
import { TYPE_LABELS } from '@/lib/homeSections';

const manifest = {
  status: 'success',
  data: {
    version: 1,
    basePath: '/api',
    envelope: 'Every response is { status, data } (errors add message + code).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/settings',
        tag: 'Storefront',
        auth: 'none',
        summary: 'Store settings every storefront shell needs.',
      },
      {
        method: 'GET',
        path: '/api/banners',
        tag: 'Storefront',
        auth: 'none',
        summary: 'Active banners inside their schedule window.',
        params: [
          {
            name: 'position',
            type: 'enum',
            values: ['hero', 'promo', 'strip'],
            optional: true,
            description: 'Only banners for this home-page placement.',
          },
        ],
      },
      {
        method: 'POST',
        path: '/api/auth/login',
        tag: 'Accounts',
        auth: 'none',
        summary: 'Sign in with email + password.',
        params: [{ name: 'email', type: 'string', description: 'Email address.' }],
      },
    ],
  },
};

function okFetch(body: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('DevelopersPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', okFetch(manifest));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the live hero contract tables from lib/heroOptions', () => {
    const { container } = render(<DevelopersPage />);
    expect(container.textContent).toContain('Developer reference');
    expect(container.textContent).toContain('slideshow · single · split');
    for (const [key, px] of Object.entries(HERO_HEIGHT_PX)) {
      expect(container.textContent).toContain(`${key} ${px.desktop}px`);
    }
    // The defaults row values come from the real constants.
    expect(container.textContent).toContain('6');
  });

  it('renders the home section types from lib/homeSections', () => {
    const { container } = render(<DevelopersPage />);
    for (const key of ['hero', 'featured', 'categories', 'promo']) {
      expect(container.textContent).toContain(key);
      expect(container.textContent).toContain(TYPE_LABELS[key]);
    }
  });

  it('renders the endpoint catalog from the live manifest fetch', async () => {
    render(<DevelopersPage />);
    // Rows appear once the manifest resolves.
    expect(await screen.findByText('/api/settings')).toBeTruthy();
    expect(screen.getByText('/api/banners')).toBeTruthy();
    expect(screen.getByText('/api/auth/login')).toBeTruthy();
    expect(screen.getByText('3 of 3 endpoints · manifest v1')).toBeTruthy();
  });

  it('expands an endpoint row to show params and a Try it button', async () => {
    render(<DevelopersPage />);
    const row = (await screen.findByText('/api/banners')).closest('button');
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    expect(await screen.findByText('position')).toBeTruthy();
    expect(
      screen.getByText((t) => typeof t === 'string' && t.includes('hero|promo|strip'))
    ).toBeTruthy();
    expect(screen.getAllByText('Try it').length).toBeGreaterThan(0);
  });

  it('“Try it” fires the entry’s own method (POST sends an empty JSON body)', async () => {
    const fetchMock = okFetch(manifest);
    vi.stubGlobal('fetch', fetchMock);
    render(<DevelopersPage />);
    const row = (await screen.findByText('/api/auth/login')).closest('button');
    expect(row).toBeTruthy();
    fireEvent.click(row!);
    await waitFor(() => {
      expect(
        screen.getAllByRole('button').some((b) => b.textContent === 'Try it')
      ).toBe(true);
    });
    const tryButton = screen
      .getAllByRole('button')
      .find((b) => b.textContent === 'Try it')!;
    fireEvent.click(tryButton);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/auth/login'),
        expect.objectContaining({ method: 'POST', body: '{}' })
      );
    });
  });

  it('shows a helpful error when the manifest cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('API down');
      }) as unknown as typeof fetch
    );
    render(<DevelopersPage />);
    expect(
      await screen.findByText(/Could not load the endpoint manifest/i)
    ).toBeTruthy();
  });

  it('hero demo output is produced by the live normaliser (split forces motion off)', async () => {
    const { container } = render(<DevelopersPage />);
    // Default config.hero -> normalised defaults.
    await waitFor(() => {
      expect(container.textContent).toContain('"layout": "slideshow"');
    });
    const selects = Array.from(container.querySelectorAll('select'));
    const layoutSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === 'split')
    );
    expect(layoutSelect).toBeTruthy();
    fireEvent.change(layoutSelect!, { target: { value: 'split' } });
    await waitFor(() => {
      expect(container.textContent).toContain('"layout": "split"');
      expect(container.textContent).toContain('"autoPlay": false');
      expect(container.textContent).toContain('"showArrows": false');
    });
  });
});
