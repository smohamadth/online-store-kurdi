'use client';

import { useState, useEffect } from 'react';

export default function AdminSettingsPage() {
  const [saving, setSaving] = useState(false);
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
    const stored = localStorage.getItem('storeSettings');
    if (stored) {
      try {
        setStoreSettings(prev => ({ ...prev, ...JSON.parse(stored) }));
      } catch (e) {}
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(storeSettings),
        });
      }

      localStorage.setItem('storeSettings', JSON.stringify(storeSettings));
      window.dispatchEvent(new Event('settingsChange'));
      setMessage({ type: 'success', text: 'Settings saved!' });
    } catch (err) {
      localStorage.setItem('storeSettings', JSON.stringify(storeSettings));
      window.dispatchEvent(new Event('settingsChange'));
      setMessage({ type: 'success', text: 'Settings saved locally!' });
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
            <select value={storeSettings.currency} onChange={(e) => setStoreSettings({ ...storeSettings, currency: e.target.value, currencySymbol: e.target.value === 'EUR' ? '€' : e.target.value === 'GBP' ? '£' : '$' })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
              <option value="GBP">£ GBP</option>
            </select>
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
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: '12px 32px', backgroundColor: saving ? '#ccc' : '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '16px' }}>
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>
    </div>
  );
}
