'use client';

import { useState, useEffect } from 'react';
import { authHttp, errorMessage } from '@/lib/http';

interface Channel {
  id: string;
  name: string;
  displayName: string;
  type: string;
  isActive: boolean;
}

interface WebhookSecret {
  provider: string;
  rotatedAt?: string;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [secrets, setSecrets] = useState<Record<string, WebhookSecret>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', displayName: '', type: 'marketplace' });
  const [secretForm, setSecretForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await authHttp.get<Channel[]>('/inventory/channels');
    setChannels(res.data || []);
  };

  useEffect(() => { load().catch(console.error); }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await authHttp.post('/inventory/channels', form);
      setShowForm(false);
      setForm({ name: '', displayName: '', type: 'marketplace' });
      await load();
    } catch (err) {
      alert(errorMessage(err, 'Could not create channel.'));
    } finally {
      setBusy(false);
    }
  };

  const saveSecret = async (provider: string) => {
    const secret = secretForm[provider];
    if (!secret) return;
    try {
      const res = await authHttp.post<WebhookSecret>('/inventory/webhook-secrets', { provider, secret });
      setSecrets({ ...secrets, [provider]: res.data });
      setSecretForm({ ...secretForm, [provider]: '' });
    } catch (err) {
      alert(errorMessage(err, 'Could not save webhook secret.'));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Sales channels & 3PL</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          data-testid="new-channel"
          style={{ padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          {showForm ? 'Cancel' : '+ New channel'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '12px' }}>
            <input placeholder="name (amazon_us)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
            <input placeholder="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} style={input} />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={input}>
              <option value="online">Online</option>
              <option value="marketplace">Marketplace</option>
              <option value="retail">Retail</option>
            </select>
          </div>
          <div style={{ marginTop: '12px', textAlign: 'right' }}>
            <button onClick={submit} disabled={busy} style={{ padding: '8px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Create</button>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9' }}>
              <th style={th}>Name</th>
              <th style={th}>Display</th>
              <th style={th}>Type</th>
              <th style={th}>Webhook secret</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No channels yet.</td></tr>}
            {channels.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid #e5e5e5' }}>
                <td style={td}><code>{c.name}</code></td>
                <td style={td}>{c.displayName}</td>
                <td style={td}>{c.type}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="password"
                      placeholder={secrets[c.name] ? '•••••• (rotated)' : 'shared secret'}
                      value={secretForm[c.name] || ''}
                      onChange={(e) => setSecretForm({ ...secretForm, [c.name]: e.target.value })}
                      style={{ ...input, maxWidth: '180px' }}
                    />
                    <button onClick={() => saveSecret(c.name)} style={btnSm}>Save</button>
                    {secrets[c.name]?.rotatedAt && (
                      <span style={{ fontSize: '11px', color: '#22c55e' }}>✓ rotated</span>
                    )}
                  </div>
                </td>
                <td style={td}>{c.isActive ? '✅' : '❌'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '24px', padding: '16px', background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: '8px' }}>
        <p style={{ fontWeight: 600, color: '#1e40af' }}>📡 3PL webhook</p>
        <p style={{ fontSize: '13px', color: '#1e40af', marginTop: '4px' }}>
          Providers post signed stock updates to <code>POST /api/inventory/webhooks/3pl</code> with headers
          <code> X-Provider</code> and <code>X-Signature</code>. The secret above is shared with the provider
          to sign the body via HMAC-SHA256.
        </p>
      </div>
    </div>
  );
}

const input: React.CSSProperties = { padding: '6px', border: '1px solid #e5e5e5', borderRadius: '4px' };
const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600 };
const td: React.CSSProperties = { padding: '12px 16px', fontSize: '14px' };
const btnSm: React.CSSProperties = { padding: '4px 8px', background: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
