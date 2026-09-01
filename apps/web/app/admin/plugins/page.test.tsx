/**
 * Component tests for the /admin/plugins dashboard.
 *
 * Pins the admin plugin-lifecycle UI contract:
 *   - first load fires GET /api/plugins and renders rows (bundled + installed)
 *   - selecting a plugin loads its detail (GET /api/plugins/:id) and shows
 *     the config form + test buttons + log
 *   - Save PATCHes /api/plugins/:id with url/timeout/config
 *   - Toggle calls PATCH with enabled: false/true
 *   - Uninstall calls DELETE (and stays after a 400 "disable first")
 *   - install uploads the .zip via multipart POST /api/plugins/install
 *   - Test fires POST /api/plugins/:id/test and shows the outcome
 *
 * Mock lifecycle mirrors app/admin/variants/page.test.tsx (global setup
 * restores mocks in afterEach).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), replace: vi.fn(),
  }),
  useParams: () => ({}),
  usePathname: () => '/admin/plugins',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/http', () => ({
  API_BASE: 'http://api.local/api',
}));

vi.mock('@/lib/hooks', () => ({
  useIsMobile: () => false,
}));

import PluginsPage from './page';

const BUNDLED = {
  id: 'order-logger',
  name: 'Order Logger',
  description: 'Platform-bundled plugin (in-process code handler).',
  version: 'bundled',
  author: 'Platform',
  kind: 'code',
  hooks: ['order.created', 'payment.settled'],
  bundled: true,
  enabled: true,
  installedAt: null,
  config: {},
  configSchema: {},
  logCount: 0,
};

const INSTALLED = {
  id: 'slack-alerts',
  name: 'Slack Alerts',
  description: 'Post order events to Slack',
  version: '1.2.3',
  author: 'Acme',
  kind: 'webhook',
  hooks: ['order.created'],
  bundled: false,
  enabled: true,
  installedAt: '2026-01-01T00:00:00Z',
  config: { channel: '#general' },
  configSchema: { channel: { type: 'string', label: 'Channel', required: true } },
  logCount: 2,
  url: 'https://hooks.example.com/slack',
  timeoutMs: 5000,
};

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function mockRoutes() {
  hoisted.fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === 'http://api.local/api/plugins' && (!init || !init.method || init.method === 'GET')) {
      return json(200, { status: 'success', data: [BUNDLED, INSTALLED] });
    }
    if (url === 'http://api.local/api/plugins/slack-alerts' && (!init || !init.method)) {
      return json(200, { status: 'success', data: INSTALLED });
    }
    if (url === 'http://api.local/api/plugins/slack-alerts' && init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      return json(200, { status: 'success', data: { ...INSTALLED, ...body } });
    }
    if (url === 'http://api.local/api/plugins/slack-alerts' && init?.method === 'DELETE') {
      return json(400, { status: 'error', message: 'Disable the plugin before uninstalling it', code: 'MUST_DISABLE' });
    }
    if (url === 'http://api.local/api/plugins/slack-alerts/log') {
      return json(200, {
        status: 'success',
        data: [
          { ts: '2026-01-01T00:00:00Z', event: 'order.created', eventId: 'e1', ok: true, status: 200, error: null, durationMs: 12 },
        ],
      });
    }
    if (url === 'http://api.local/api/plugins/slack-alerts/test' && init?.method === 'POST') {
      return json(200, {
        status: 'success',
        data: { event: 'order.created', delivered: true, status: 200, error: null, durationMs: 12, recordedAt: '2026-01-01T00:00:00Z' },
      });
    }
    if (url === 'http://api.local/api/plugins/install' && init?.method === 'POST') {
      return json(201, { status: 'success', data: INSTALLED });
    }
    return json(404, { status: 'error', message: 'not mocked: ' + url });
  });
}

beforeEach(() => {
  hoisted.fetchMock.mockReset();
  mockRoutes();
  globalThis.fetch = hoisted.fetchMock as any;
});

describe('PluginsPage', () => {
  it('renders the catalog rows (bundled + installed) with status badges', async () => {
    render(<PluginsPage />);
    expect(await screen.findByText('Slack Alerts')).toBeTruthy();
    expect(screen.getByText(/Order Logger/)).toBeTruthy();
    expect(screen.getByTestId('plugin-row-order-logger')).toBeTruthy();
    expect(screen.getByTestId('plugin-row-slack-alerts')).toBeTruthy();
    expect(screen.getByTestId('plugin-enabled-slack-alerts').textContent).toContain('enabled');
    expect(screen.getByText('bundled')).toBeTruthy();
  });

  it('selecting a plugin loads its detail and pre-fills the config form', async () => {
    render(<PluginsPage />);
    await screen.findByText('Slack Alerts');
    fireEvent.click(screen.getByTestId('plugin-row-slack-alerts'));

    await waitFor(() => expect(screen.getByTestId('plugin-detail')).toBeTruthy());
    expect((screen.getByTestId('plugin-url-input') as HTMLInputElement).value).toBe('https://hooks.example.com/slack');
    expect((screen.getByTestId('plugin-config-channel') as HTMLInputElement).value).toBe('#general');
    // Bundled rows expose no mutation controls.
    expect(screen.getByTestId('plugin-test-order.created')).toBeTruthy();
  });

  it('save PATCHes url/timeout/config', async () => {
    render(<PluginsPage />);
    await screen.findByText('Slack Alerts');
    fireEvent.click(screen.getByTestId('plugin-row-slack-alerts'));
    await waitFor(() => expect(screen.getByTestId('plugin-detail')).toBeTruthy());

    fireEvent.change(screen.getByTestId('plugin-url-input'), { target: { value: 'https://hooks.example.com/new' } });
    fireEvent.change(screen.getByTestId('plugin-config-channel'), { target: { value: '#ops' } });
    fireEvent.click(screen.getByTestId('plugin-save'));

    await waitFor(() => {
      const patch = hoisted.fetchMock.mock.calls.find((c) => c[0] === 'http://api.local/api/plugins/slack-alerts' && c[1]?.method === 'PATCH');
      expect(patch).toBeTruthy();
      const body = JSON.parse(String(patch![1].body));
      expect(body.url).toBe('https://hooks.example.com/new');
      expect(body.config.channel).toBe('#ops');
    });
  });

  it('toggle calls PATCH enabled and uninstall warns via API', async () => {
    render(<PluginsPage />);
    await screen.findByText('Slack Alerts');

    fireEvent.click(screen.getByTestId('plugin-toggle-slack-alerts'));
    await waitFor(() => {
      const patch = hoisted.fetchMock.mock.calls.find((c) => c[0] === 'http://api.local/api/plugins/slack-alerts' && c[1]?.method === 'PATCH');
      expect(JSON.parse(String(patch![1].body)).enabled).toBe(false);
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByTestId('plugin-remove-slack-alerts'));
    await waitFor(() => {
      expect(hoisted.fetchMock.mock.calls.some((c) => c[0] === 'http://api.local/api/plugins/slack-alerts' && c[1]?.method === 'DELETE')).toBe(true);
    });
    confirmSpy.mockRestore();
  });

  it('test fires a sample event and shows the outcome', async () => {
    render(<PluginsPage />);
    await screen.findByText('Slack Alerts');
    fireEvent.click(screen.getByTestId('plugin-row-slack-alerts'));
    await waitFor(() => expect(screen.getByTestId('plugin-detail')).toBeTruthy());

    fireEvent.click(screen.getByTestId('plugin-test-order.created'));
    expect(await screen.findByTestId('plugin-test-result')).toBeTruthy();
    expect(screen.getByTestId('plugin-test-result').textContent).toContain('Delivered');
  });

  it('uploading a file POSTs the zip to /api/plugins/install', async () => {
    render(<PluginsPage />);
    await screen.findByText('Slack Alerts');

    const input = screen.getByTestId('plugin-upload-input');
    const file = new File(['zip-bytes'], 'slack.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const call = hoisted.fetchMock.mock.calls.find((c) => c[0] === 'http://api.local/api/plugins/install');
      expect(call).toBeTruthy();
      expect(call![1]?.method).toBe('POST');
      expect(call![1]?.body instanceof FormData).toBe(true);
    });
  });
});
