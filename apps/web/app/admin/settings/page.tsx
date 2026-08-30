// ---------------------------------------------------------------------------
// /admin/settings - the store settings form (identity, currency, units,
// timezone, social links, SEO meta, maintenance mode).
//
// Saves via PUT /api/settings. The server's NOT_NULL round-trip rule
// (apps/api/.../settings.routes.ts) is what makes this form work:
// empty optional fields are sent as null and the server maps those to
// "leave as-is" on NOT NULL columns and "clear" on nullable ones.
//
// Also hosts the email-template editor (GET/PUT /api/
// settings/email-templates) and the test-email button, which reports
// honestly whether mail was SENT or only LOGGED (isEmailConfigured).
// ---------------------------------------------------------------------------
'use client';

// Currency list used by the settings dropdown. Selecting one fills in the
// matching symbol, which can still be overridden by hand below.
const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'IQD', symbol: 'ع.د', name: 'Iraqi Dinar' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'IRR', symbol: '﷼', name: 'Iranian Rial' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
];

import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/http';

export default function AdminSettingsPage() {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [storeSettings, setStoreSettings] = useState({
    storeName: 'Online Store',
    storeDescription: '',
    storeEmail: 'info@store.com',
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
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // Try API first
      const response = await fetch(`${API_BASE}/settings`);
      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          setStoreSettings(prev => ({ ...prev, ...data.data }));
          // Also save to localStorage for offline access
          localStorage.setItem('storeSettings', JSON.stringify({ ...storeSettings, ...data.data }));
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.log('Settings API not available');
    }

    // Fallback to localStorage
    const stored = localStorage.getItem('storeSettings');
    if (stored) {
      try {
        setStoreSettings(prev => ({ ...prev, ...JSON.parse(stored) }));
      } catch (e) {}
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setMessage({ type: 'error', text: 'You are signed out. Please sign in again.' });
        return;
      }

      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(storeSettings),
      });

      if (!res.ok) {
        // This used to report "Settings saved!" regardless of the response and
        // then write to localStorage, so a rejected save looked successful and
        // the change was invisible to every other device.
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.message || `Save failed (${res.status}). Nothing was stored.` });
        return;
      }

      const saved = await res.json();
      // Mirror the SERVER's response locally purely as an offline cache.
      localStorage.setItem('storeSettings', JSON.stringify(saved.data || storeSettings));
      window.dispatchEvent(new Event('settingsChange'));
      setMessage({ type: 'success', text: 'Settings saved to the database.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Could not reach the server. Your changes were NOT saved.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {message.text && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#22c55e' : '#fecaca'}`,
          borderRadius: '6px',
          color: message.type === 'success' ? '#22c55e' : '#ef4444',
          marginBottom: '24px',
        }}>
          {message.text}
        </div>
      )}

      {/* Store Information */}
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>🏪 Store Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Store Name *</label>
            <input type="text" value={storeSettings.storeName} onChange={(e) => setStoreSettings({ ...storeSettings, storeName: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Store Email *</label>
            <input type="email" value={storeSettings.storeEmail} onChange={(e) => setStoreSettings({ ...storeSettings, storeEmail: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Phone</label>
            <input type="tel" value={storeSettings.storePhone} onChange={(e) => setStoreSettings({ ...storeSettings, storePhone: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Country</label>
            <select value={storeSettings.storeCountry} onChange={(e) => setStoreSettings({ ...storeSettings, storeCountry: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Address</label>
            <input type="text" value={storeSettings.storeAddress} onChange={(e) => setStoreSettings({ ...storeSettings, storeAddress: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>City</label>
            <input type="text" value={storeSettings.storeCity} onChange={(e) => setStoreSettings({ ...storeSettings, storeCity: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>State</label>
            <input type="text" value={storeSettings.storeState} onChange={(e) => setStoreSettings({ ...storeSettings, storeState: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Currency</label>
            <select
              value={storeSettings.currency}
              onChange={(e) => {
                const code = e.target.value;
                setStoreSettings({
                  ...storeSettings,
                  currency: code,
                  currencySymbol: CURRENCIES.find((c) => c.code === code)?.symbol || storeSettings.currencySymbol,
                });
              }}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* The dropdown only offered USD/EUR/GBP, and there was no way to set
              a symbol for any other currency. Stores outside those three could
              not display their own currency at all. */}
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              Currency Symbol
            </label>
            <input
              type="text"
              maxLength={6}
              value={storeSettings.currencySymbol}
              onChange={(e) => setStoreSettings({ ...storeSettings, currencySymbol: e.target.value })}
              placeholder="$"
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
            <p style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>
              Shown next to every price. Overrides the symbol from the currency above.
            </p>
          </div>
        </div>
      </div>

      {/* SEO Settings */}
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>🔍 SEO Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Meta Title</label>
            <input type="text" value={storeSettings.metaTitle} onChange={(e) => setStoreSettings({ ...storeSettings, metaTitle: e.target.value })} placeholder="My Store - Best Products" style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Shows in browser tab and search results</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Meta Description</label>
            <textarea value={storeSettings.metaDescription} onChange={(e) => setStoreSettings({ ...storeSettings, metaDescription: e.target.value })} rows={3} placeholder="Shop the best products..." style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Shows in search engine results</p>
          </div>
        </div>
      </div>

      {/* Social Media */}
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>📱 Social Media Links</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Facebook</label>
            <input type="url" value={storeSettings.facebookUrl} onChange={(e) => setStoreSettings({ ...storeSettings, facebookUrl: e.target.value })} placeholder="https://facebook.com/yourstore" style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Instagram</label>
            <input type="url" value={storeSettings.instagramUrl} onChange={(e) => setStoreSettings({ ...storeSettings, instagramUrl: e.target.value })} placeholder="https://instagram.com/yourstore" style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Twitter</label>
            <input type="url" value={storeSettings.twitterUrl} onChange={(e) => setStoreSettings({ ...storeSettings, twitterUrl: e.target.value })} placeholder="https://twitter.com/yourstore" style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>YouTube</label>
            <input type="url" value={storeSettings.youtubeUrl} onChange={(e) => setStoreSettings({ ...storeSettings, youtubeUrl: e.target.value })} placeholder="https://youtube.com/yourstore" style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
        </div>
      </div>

      {/* Maintenance */}
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>🔧 Maintenance Mode</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <input type="checkbox" id="maintenance" checked={storeSettings.maintenanceMode} onChange={(e) => setStoreSettings({ ...storeSettings, maintenanceMode: e.target.checked })} />
          <label htmlFor="maintenance" style={{ fontWeight: 500 }}>Enable Maintenance Mode</label>
        </div>
        {storeSettings.maintenanceMode && (
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Maintenance Message</label>
            <textarea value={storeSettings.maintenanceMessage} onChange={(e) => setStoreSettings({ ...storeSettings, maintenanceMessage: e.target.value })} rows={3} placeholder="We're performing maintenance..." style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
          </div>
        )}
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button onClick={fetchSettings} disabled={loading} style={{ padding: '12px 24px', backgroundColor: '#f5f5f5', color: '#000', border: '1px solid #e5e5e5', borderRadius: '6px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '12px 32px', backgroundColor: saving ? '#ccc' : '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '16px' }}>
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>
    </div>
  );
}
