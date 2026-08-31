// ---------------------------------------------------------------------------
// Admin → Payments → Payment Gateways.
//
// Lets the store owner activate a payment gateway and fill in their own API
// keys / credentials (Zarinpal, IDPay, ZainCash, FIB, PayPal, Stripe).
// Credentials are stored server-side in StoreSettings.paymentGateways and
// never exposed through the public settings endpoint — the storefront only
// learns which gateways are *enabled*.
//
// Reads/writes GET/PUT/DELETE /api/settings/payment-gateways (admin only).
// ---------------------------------------------------------------------------
'use client';

import { useState, useEffect } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

interface GatewayField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'boolean' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  secret?: boolean;
}

interface GatewayDefinition {
  id: string;
  name: string;
  label: string;
  country: 'IR' | 'IQ' | 'global';
  description: string;
  currencyHint?: string;
  fields: GatewayField[];
}

type Config = Record<string, string | boolean>;

export default function AdminPaymentsPage() {
  const [definitions, setDefinitions] = useState<GatewayDefinition[]>([]);
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await authHttp.get<{ gateways: Record<string, Config>; definitions: GatewayDefinition[] }>(
        '/settings/payment-gateways',
      );
      setConfigs(res.data?.gateways || {});
      setDefinitions(res.data?.definitions || []);
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to load payment gateways: ${errorMessage(err)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = (id: string, key: string, value: string | boolean) => {
    setConfigs((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  };

  const setEnabled = (id: string, enabled: boolean) => {
    setConfigs((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), enabled } }));
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await authHttp.put('/settings/payment-gateways', { gateways: { [id]: configs[id] || { enabled: false } } });
      setMessage({ type: 'success', text: `${id} configuration saved.` });
      await fetchConfig();
    } catch (err) {
      setMessage({ type: 'error', text: `Save failed: ${errorMessage(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (id: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await authHttp.delete(`/settings/payment-gateways/${id}`);
      setMessage({ type: 'success', text: `${id} configuration cleared.` });
      await fetchConfig();
    } catch (err) {
      setMessage({ type: 'error', text: `Clear failed: ${errorMessage(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    fontFamily: 'inherit',
    fontSize: 14,
    boxSizing: 'border-box',
  };

  if (loading && definitions.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#888' }}>Loading payment gateways…</div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>Payment Gateways</h1>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          Activate a gateway and fill in your own API keys. The storefront automatically offers each
          enabled gateway at checkout. Credentials are stored securely and never shown to shoppers.
        </p>
      </div>

      {message && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 6,
            fontSize: 13,
            background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : '#b91c1c',
            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {definitions.map((def) => {
          const cfg = configs[def.id] || {};
          const enabled = cfg.enabled === true;
          const required = def.fields.filter((f) => f.required && f.type !== 'boolean');
          const configured = required.every((f) => {
            const v = cfg[f.key];
            return v !== undefined && v !== null && String(v) !== '';
          });
          return (
            <div
              key={def.id}
              style={{ border: `1px solid ${enabled ? '#bbf7d0' : '#e5e5e5'}`, borderRadius: 10, padding: 18, background: '#fff' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {def.name}
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: '#888' }}>
                    {def.country === 'IR' ? '🇮🇷 Iran' : def.country === 'IQ' ? '🇮🇶 Iraq' : '🌍 International'}
                    {def.currencyHint ? ` · ${def.currencyHint}` : ''}
                  </span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(def.id, e.target.checked)} />
                  {enabled ? 'Enabled' : 'Disabled'}
                  {configured ? <span style={{ color: '#16a34a' }}>✓</span> : null}
                </label>
              </div>

              <p style={{ fontSize: 13, color: '#666', margin: '10px 0 16px', lineHeight: 1.5 }}>{def.description}</p>

              <div style={{ display: 'grid', gap: 14 }}>
                {def.fields.map((f) => {
                  const value = cfg[f.key] ?? '';
                  if (f.type === 'boolean') {
                    return (
                      <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        <input type="checkbox" checked={value === true} onChange={(e) => updateField(def.id, f.key, e.target.checked)} />
                        {f.label}
                        {f.help ? <span style={{ color: '#888', fontSize: 12 }}>— {f.help}</span> : null}
                      </label>
                    );
                  }
                  if (f.type === 'select') {
                    return (
                      <label key={f.key} style={{ display: 'block' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{f.label}</div>
                        <select value={String(value)} onChange={(e) => updateField(def.id, f.key, e.target.value)} style={inputStyle}>
                          <option value="">Select…</option>
                          {(f.options || []).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        {f.help ? <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{f.help}</div> : null}
                      </label>
                    );
                  }
                  return (
                    <label key={f.key} style={{ display: 'block' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                        {f.label}
                        {f.required ? <span style={{ color: '#b91c1c' }}> *</span> : null}
                      </div>
                      <input
                        type={f.type === 'password' ? 'password' : 'text'}
                        value={String(value)}
                        onChange={(e) => updateField(def.id, f.key, e.target.value)}
                        placeholder={f.placeholder || f.label}
                        style={inputStyle}
                      />
                      {f.help ? <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{f.help}</div> : null}
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleSave(def.id)}
                  disabled={saving}
                  style={{ padding: '10px 20px', borderRadius: 6, background: '#000', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => handleClear(def.id)}
                  disabled={saving}
                  style={{ padding: '10px 20px', borderRadius: 6, background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
