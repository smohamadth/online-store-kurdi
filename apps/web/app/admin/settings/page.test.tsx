/**
 * AdminSettingsPage — the store settings form.
 *
 * Verifies settings load from the API into the form and that saving PUTs
 * the full settings object, surfacing a success message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminSettingsPage from './page';

const serverSettings = {
  storeName: 'Kurdi Store',
  storeEmail: 'shop@kurdi.store',
  currency: 'USD',
  currencySymbol: '$',
  storeDescription: 'Best goods',
  maintenanceMode: false,
  storePhone: '', storeAddress: '', storeCity: '', storeState: '', storeCountry: 'US',
  metaTitle: '', metaDescription: '', facebookUrl: '', instagramUrl: '', twitterUrl: '', youtubeUrl: '', maintenanceMessage: '',
};

function okJson(data: any) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) } as any);
}

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  it('loads settings and saves them back via PUT', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('email-templates')) return okJson([]);
      if (String(url).includes('/settings') && (!opts?.method || opts.method === 'GET')) return okJson(serverSettings);
      if (String(url).includes('/settings') && opts?.method === 'PUT') return okJson(serverSettings);
      return okJson(null);
    });
    (global.fetch as any) = fetchMock;

    render(<AdminSettingsPage />);
    // Store name input is pre-filled from the fetched settings.
    await waitFor(() =>
      expect((screen.getByDisplayValue('Kurdi Store') as HTMLInputElement).value).toBe('Kurdi Store')
    );

    fireEvent.change(screen.getByDisplayValue('Kurdi Store'), { target: { value: 'Kurdi Store 2' } });
    screen.getByText('Save All Settings').click();

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/settings'),
        expect.objectContaining({ method: 'PUT' })
      )
    );
    const putCall = (global.fetch as any).mock.calls.find((c: any) => c[1]?.method === 'PUT');
    expect(JSON.parse(putCall[1].body).storeName).toBe('Kurdi Store 2');
    await waitFor(() => expect(screen.getByText('Settings saved to the database.')).toBeTruthy());
  });

  it('exposes Google Analytics and store description on the form and PUT', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (String(url).includes('email-templates')) return okJson([]);
      if (String(url).includes('/settings') && (!opts?.method || opts.method === 'GET')) {
        return okJson({ ...serverSettings, googleAnalyticsId: '', storeDescription: 'Best goods' });
      }
      if (String(url).includes('/settings') && opts?.method === 'PUT') return okJson(serverSettings);
      return okJson(null);
    });
    (global.fetch as any) = fetchMock;
    render(<AdminSettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Best goods')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('G-XXXXXXXX'), { target: { value: 'G-ABC' } });
    screen.getByText('Save All Settings').click();
    await waitFor(() => {
      const putCall = (global.fetch as any).mock.calls.find((c: any) => c[1]?.method === 'PUT' && String(c[0]).includes('/settings') && !String(c[0]).includes('email'));
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall[1].body).googleAnalyticsId).toBe('G-ABC');
    });
  });
});
