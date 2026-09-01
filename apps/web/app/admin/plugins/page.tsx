'use client';

/**
 * Plugins — the admin plugin lifecycle page.
 *
 * Catalog = bundled (in-process code plugins, read-only) + installed
 * (admin-uploaded .zip packages, data-only: they deliver signed webhooks
 * to an admin-configured URL). Here an admin can:
 *   - install a plugin .zip from disk
 *   - toggle enable/disable, set the webhook URL + timeout
 *   - fill the plugin's own config form (configSchema-driven)
 *   - fire a sample event ("Test") through the real pipeline
 *   - inspect the execution log and uninstall (disabled plugins only)
 *
 * Bundled plugins appear in the catalog but every mutation is refused by
 * the API — this page simply hides those controls for them.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { API_BASE } from '@/lib/http';
import { useIsMobile } from '@/lib/hooks';

interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  kind: 'webhook' | 'code';
  hooks: string[];
  bundled: boolean;
  enabled: boolean;
  installedAt: string | null;
  config: Record<string, string | boolean | number>;
  configSchema: Record<string, { type: 'string' | 'boolean' | 'number'; label?: string; required?: boolean; default?: string | boolean | number; secret?: boolean; max?: number }>;
  logCount: number;
  url?: string;
  timeoutMs?: number;
}

interface ExecLogLine {
  ts: string;
  event: string;
  eventId: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number | null;
}

const HOOK_LABELS: Record<string, string> = {
  'order.created': 'Order created',
  'payment.settled': 'Payment settled',
  'product.created': 'Product created',
  'product.updated': 'Product updated',
  'customer.registered': 'Customer registered',
};

async function api<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function maskErr(status: number, body: any): string {
  return body?.message || `Request failed (${status})`;
}

export default function PluginsPage() {
  const isMobile = useIsMobile();
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Editable form state for the selected installed plugin.
  const [draftUrl, setDraftUrl] = useState('');
  const [draftTimeout, setDraftTimeout] = useState('5000');
  const [draftConfig, setDraftConfig] = useState<Record<string, string | boolean | number>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [log, setLog] = useState<ExecLogLine[] | null>(null);

  const refresh = useCallback(async () => {
    const { status, body } = await api('/plugins');
    if (status !== 200) {
      setError(maskErr(status, body));
      return;
    }
    setError(null);
    setPlugins(body.data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = plugins?.find((p) => p.id === selectedId) ?? null;

  const openPlugin = async (id: string) => {
    setSelectedId(id);
    setLog(null);
    setTestResult(null);
    const { status, body } = await api(`/plugins/${id}`);
    if (status === 200 && body.data) {
      const p = body.data as PluginInfo;
      setDraftUrl(typeof p.url === 'string' ? p.url : '');
      setDraftTimeout(String(typeof p.timeoutMs === 'number' ? p.timeoutMs : 5000));
      const cfg: Record<string, string | boolean | number> = {};
      for (const [k, v] of Object.entries(p.config)) {
        cfg[k] = v as string | boolean | number;
      }
      setDraftConfig(cfg);
    }
  };

  const installZip = async (file: File) => {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/plugins/install`, {
        method: 'POST',
        body: form,
      });
      const body = await res.json().catch(() => null);
      if (res.status !== 201) {
        setError(maskErr(res.status, body));
        return;
      }
      setNotice(`Plugin "${body.data?.id}" installed. Configure it below.`);
      await refresh();
      await openPlugin(body.data?.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const savePlugin = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        url: draftUrl,
        timeoutMs: Number(draftTimeout),
        config: draftConfig,
      };
      const { status, body } = await api(`/plugins/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (status !== 200) {
        setError(maskErr(status, body));
        return;
      }
      setNotice(`Plugin "${selected.id}" saved.`);
      await refresh();
      await openPlugin(selected.id);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (p: PluginInfo) => {
    const { status, body } = await api(`/plugins/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    if (status !== 200) {
      setError(maskErr(status, body));
      return;
    }
    setNotice(`Plugin "${p.id}" ${!p.enabled ? 'enabled' : 'disabled'}.`);
    await refresh();
  };

  const runTest = async (event: string) => {
    if (!selected) return;
    setTesting(event);
    setTestResult(null);
    setError(null);
    try {
      const { status, body } = await api(`/plugins/${selected.id}/test`, {
        method: 'POST',
        body: JSON.stringify({ event }),
      });
      if (status !== 200) {
        setError(maskErr(status, body));
        return;
      }
      const d = body.data as { delivered: boolean; status: number | null; error: string | null; durationMs: number | null };
      setTestResult(
        d.delivered
          ? `Delivered (HTTP ${d.status ?? '?'}) in ${d.durationMs ?? '?'}ms`
          : `Failed — ${d.error ?? 'no response'}${d.status ? ` (HTTP ${d.status})` : ''}`
      );
      await loadLog(selected.id);
    } finally {
      setTesting(null);
    }
  };

  const loadLog = async (id: string) => {
    const { status, body } = await api(`/plugins/${id}/log`);
    if (status === 200) setLog(body.data as ExecLogLine[]);
  };

  const uninstall = async (p: PluginInfo) => {
    if (!window.confirm(`Uninstall plugin "${p.id}"? This removes its package and state.`)) return;
    const { status, body } = await api(`/plugins/${p.id}`, { method: 'DELETE' });
    if (status !== 200) {
      setError(maskErr(status, body));
      return;
    }
    setNotice(body?.message ?? `Plugin "${p.id}" uninstalled.`);
    setSelectedId(null);
    await refresh();
  };

  const fieldLabel = (key: string, spec: PluginInfo['configSchema'][string]): string =>
    spec?.label || key;

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>🧩 Plugins</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>
        Installed plugins are data-only: they receive signed webhooks for the events they subscribe to.
        Bundled plugins run in-process and are part of the platform.
      </p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
          {notice}
        </div>
      )}

      {/* Install */}
      <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Install a plugin</h2>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>
          Upload a plugin package (<code>.zip</code> containing <code>plugin.json</code>). The manifest is validated before anything is written; kind{' '}
          <code>webhook</code> only.
        </p>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <input
            data-testid="plugin-upload-input"
            type="file"
            accept=".zip"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void installZip(f);
              e.target.value = '';
            }}
          />
          {uploading && <span style={{ color: '#6b7280' }}>Installing…</span>}
        </label>
      </section>

      {/* Catalog */}
      <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Installed plugins</h2>
        {plugins === null ? (
          <p style={{ color: '#6b7280' }}>Loading…</p>
        ) : plugins.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No plugins yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plugins.map((p) => (
              <div
                key={p.id}
                data-testid={`plugin-row-${p.id}`}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selectedId === p.id ? '#f3f4f6' : '#fff',
                }}
                onClick={() => void openPlugin(p.id)}
              >
                <span style={{ fontSize: 18 }}>🧩</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600 }}>
                    {p.name}{' '}
                    <span style={{ fontWeight: 400, color: '#6b7280' }}>
                      v{p.version} · {p.author}
                    </span>
                    {p.bundled && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: '#e0e7ff',
                          color: '#3730a3',
                        }}
                      >
                        bundled
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>
                    {p.description} — hooks: {p.hooks.length ? p.hooks.map((h) => HOOK_LABELS[h] || h).join(', ') : 'none'}
                  </div>
                </div>
                <span
                  data-testid={`plugin-enabled-${p.id}`}
                  style={{
                    fontSize: 12,
                    padding: '2px 10px',
                    borderRadius: 999,
                    background: p.enabled ? '#dcfce7' : '#f3f4f6',
                    color: p.enabled ? '#166534' : '#6b7280',
                  }}
                >
                  {p.enabled ? 'enabled' : 'disabled'}
                </span>
                {!p.bundled && (
                  <button
                    data-testid={`plugin-toggle-${p.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleEnabled(p);
                    }}
                    style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                  >
                    {p.enabled ? 'Disable' : 'Enable'}
                  </button>
                )}
                {!p.bundled && (
                  <button
                    data-testid={`plugin-remove-${p.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void uninstall(p);
                    }}
                    style={{
                      fontSize: 13,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid #fecaca',
                      background: '#fff',
                      color: '#b91c1c',
                      cursor: 'pointer',
                    }}
                  >
                    Uninstall
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Detail */}
      {selected && (
        <section data-testid="plugin-detail" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            {selected.name} <span style={{ fontWeight: 400, color: '#6b7280' }}>({selected.id})</span>
          </h2>

          {selected.bundled ? (
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              This is a bundled platform plugin — its handlers run in-process and it cannot be configured, disabled or uninstalled.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Webhook URL</span>
                  <input
                    data-testid="plugin-url-input"
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                    placeholder="https://hooks.example.com/…"
                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Timeout (ms, 100–30000)</span>
                  <input
                    data-testid="plugin-timeout-input"
                    value={draftTimeout}
                    onChange={(e) => setDraftTimeout(e.target.value)}
                    type="number"
                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                  />
                </label>
                {Object.entries(selected.configSchema).map(([key, spec]) => (
                  <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {fieldLabel(key, spec)}
                      {spec.required && <span style={{ color: '#b91c1c' }}> *</span>}
                      {spec.secret && <span style={{ color: '#6b7280', fontWeight: 400 }}> (secret — shown as dots)</span>}
                    </span>
                    {spec.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(draftConfig[key])}
                        onChange={(e) => setDraftConfig((c) => ({ ...c, [key]: e.target.checked }))}
                        style={{ width: 18, height: 18 }}
                      />
                    ) : spec.type === 'number' ? (
                      <input
                        type="number"
                        value={Number(draftConfig[key] ?? spec.default ?? 0)}
                        onChange={(e) => setDraftConfig((c) => ({ ...c, [key]: Number(e.target.value) }))}
                        style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                      />
                    ) : (
                      <input
                        data-testid={`plugin-config-${key}`}
                        value={String(draftConfig[key] ?? spec.default ?? '')}
                        onChange={(e) => setDraftConfig((c) => ({ ...c, [key]: e.target.value }))}
                        placeholder={spec.secret ? '••••••••' : ''}
                        style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                      />
                    )}
                  </label>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    data-testid="plugin-save"
                    onClick={() => void savePlugin()}
                    disabled={saving}
                    style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 14 }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    data-testid="plugin-refresh-log"
                    onClick={() => void loadLog(selected.id)}
                    style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 }}
                  >
                    Refresh log ({selected.logCount})
                  </button>
                </div>
              </div>

              {/* Test dispatch */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Test</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selected.hooks.map((h) => (
                    <button
                      key={h}
                      data-testid={`plugin-test-${h}`}
                      onClick={() => void runTest(h)}
                      disabled={testing !== null}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: testing === h ? '#f3f4f6' : '#fff', cursor: 'pointer', fontSize: 13 }}
                    >
                      {testing === h ? 'Sending…' : `Test: ${HOOK_LABELS[h] || h}`}
                    </button>
                  ))}
                  {selected.hooks.length === 0 && <p style={{ color: '#6b7280', fontSize: 13 }}>This plugin subscribes to no events.</p>}
                </div>
                {testResult && (
                  <p data-testid="plugin-test-result" style={{ marginTop: 8, fontSize: 13, color: testResult.startsWith('Delivered') ? '#065f46' : '#b91c1c' }}>
                    {testResult}
                  </p>
                )}
              </div>

              {/* Execution log */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Execution log</h3>
                {log === null ? (
                  <p style={{ color: '#6b7280', fontSize: 13 }}>Click “Refresh log” to load recent deliveries.</p>
                ) : log.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: 13 }}>No deliveries recorded yet.</p>
                ) : (
                  <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    {log.map((l, i) => (
                      <div key={i} data-testid="plugin-log-line" style={{ display: 'flex', gap: 8, padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12, fontFamily: 'monospace' }}>
                        <span style={{ color: l.ok ? '#166534' : '#b91c1c' }}>{l.ok ? '✓' : '✗'}</span>
                        <span style={{ minWidth: 150 }}>{new Date(l.ts).toLocaleString()}</span>
                        <span>{l.event}</span>
                        <span style={{ color: '#6b7280' }}>
                          {l.status ?? ''} {l.durationMs !== null ? `${l.durationMs}ms` : ''} {l.error ?? ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
