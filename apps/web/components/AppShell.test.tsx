/**
 * AppShell footer — store contact details.
 *
 * The footer used to ignore `storeAddress` even though the admin
 * settings form saves it (KNOWN_GAPS #3: "stored but unused"). These
 * tests pin the footer to the settings: the address line appears when
 * set, and stays hidden (no empty line) when unset.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppShell from '@/components/AppShell';
import { setNextRouter } from '@/test/setup-components';
import { DEFAULT_THEME } from '@/lib/theme';

// The shell calls useStoreSettings() (fetch + fallback) and useTheme().
// Inject fixed values so the footer renders deterministically without
// the network. The test theme mirrors DEFAULT_THEME.
const mockSettings = {
  storeName: 'Test Store',
  storeDescription: 'A test shop.',
  storeEmail: 'hello@test.store',
  storePhone: '',
  storeAddress: '',
  storeCity: '',
  storeState: '',
  storeCountry: 'US',
  currency: 'USD',
  currencySymbol: '$',
  metaTitle: '',
  metaDescription: '',
  facebookUrl: '',
  instagramUrl: '',
  twitterUrl: '',
  youtubeUrl: '',
  maintenanceMode: false,
  maintenanceMessage: '',
};

vi.mock('@/lib/settings', () => ({
  useStoreSettings: () => ({
    settings: (globalThis as any).__testSettings || mockSettings,
    loading: false,
  }),
}));

vi.mock('@/lib/theme', async () => {
  const actual = await vi.importActual<any>('@/lib/theme');
  return {
    ...actual,
    useTheme: () => ({
      theme: (globalThis as any).__testTheme || actual.DEFAULT_THEME,
      loading: false,
      reload: () => {},
      activeTheme: 'default',
    }),
  };
});

function withSettings(overrides: Record<string, any>) {
  (globalThis as any).__testSettings = { ...mockSettings, ...overrides };
}

beforeEach(() => {
  setNextRouter({ pathname: '/' });
  delete (globalThis as any).__testSettings;
  delete (globalThis as any).__testTheme;
});

describe('AppShell footer contact details', () => {
  it('shows the store address in the footer when it is set', () => {
    withSettings({ storeAddress: '123 Store Street, Baku' });
    render(<AppShell>content</AppShell>);
    expect(screen.getByText(/123 Store Street, Baku/)).toBeInTheDocument();
  });

  it('shows the store phone when it is set', () => {
    withSettings({ storePhone: '+994 55 123 45 67' });
    render(<AppShell>content</AppShell>);
    expect(screen.getByText(/\+994 55 123 45 67/)).toBeInTheDocument();
  });

  it('does not render an empty address line when unset', () => {
    withSettings({ storeAddress: '' });
    render(<AppShell>content</AppShell>);
    // No pin glyph at all means the whole line is absent, not an empty <p>.
    expect(screen.queryByText(/📍/)).not.toBeInTheDocument();
  });
});
