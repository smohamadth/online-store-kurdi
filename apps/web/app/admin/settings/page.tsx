'use client';

import { useState, useEffect } from 'react';

interface StoreSettings {
  storeName: string;
  storeDescription: string;
  storeEmail: string;
  storePhone: string;
  storeAddress: string;
  storeCity: string;
  storeState: string;
  storeZipCode: string;
  storeCountry: string;
  currency: string;
  currencySymbol: string;
  currencyPosition: string;
  weightUnit: string;
  dimensionUnit: string;
  timezone: string;
  dateFormat: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  youtubeUrl: string;
  metaTitle: string;
  metaDescription: string;
  googleAnalyticsId: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<StoreSettings>({
    storeName: 'My Store',
    storeDescription: '',
    storeEmail: 'info@store.com',
    storePhone: '',
    storeAddress: '',
    storeCity: '',
    storeState: '',
    storeZipCode: '',
    storeCountry: 'US',
    currency: 'USD',
    currencySymbol: '$',
    currencyPosition: 'before',
    weightUnit: 'kg',
    dimensionUnit: 'cm',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    facebookUrl: '',
    instagramUrl: '',
    twitterUrl: '',
    youtubeUrl: '',
    metaTitle: '',
    metaDescription: '',
    googleAnalyticsId: '',
    maintenanceMode: false,
    maintenanceMessage: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          setSettings(data.data);
        }
      }
    } catch (err) {
      console.log('Using default settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings' });
      }
    } catch (err) {
      // Save locally
      localStorage.setItem('storeSettings', JSON.stringify(settings));
      setMessage({ type: 'success', text: 'Settings saved locally' });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: '🏪' },
    { id: 'currency', label: 'Currency & Units', icon: '💰' },
    { id: 'seo', label: 'SEO', icon: '🔍' },
    { id: 'social', label: 'Social Media', icon: '📱' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
  ];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '64px' }}>Loading settings...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Store Settings</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 24px',
            backgroundColor: saving ? '#ccc' : '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e5e5', paddingBottom: '12px' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === tab.id ? '#f5f5f5' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #000' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {activeTab === 'general' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Store Name</label>
            <input
              type="text"
              value={settings.storeName}
              onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Store Email</label>
            <input
              type="email"
              value={settings.storeEmail}
              onChange={(e) => setSettings({ ...settings, storeEmail: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Phone</label>
            <input
              type="tel"
              value={settings.storePhone}
              onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Country</label>
            <select
              value={settings.storeCountry}
              onChange={(e) => setSettings({ ...settings, storeCountry: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            >
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="NL">Netherlands</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Address</label>
            <input
              type="text"
              value={settings.storeAddress}
              onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>City</label>
            <input
              type="text"
              value={settings.storeCity}
              onChange={(e) => setSettings({ ...settings, storeCity: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>State/Province</label>
            <input
              type="text"
              value={settings.storeState}
              onChange={(e) => setSettings({ ...settings, storeState: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
        </div>
      )}

      {/* Currency & Units */}
      {activeTab === 'currency' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Currency</label>
            <select
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            >
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="CAD">CAD - Canadian Dollar</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Currency Symbol</label>
            <input
              type="text"
              value={settings.currencySymbol}
              onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Weight Unit</label>
            <select
              value={settings.weightUnit}
              onChange={(e) => setSettings({ ...settings, weightUnit: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            >
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Dimension Unit</label>
            <select
              value={settings.dimensionUnit}
              onChange={(e) => setSettings({ ...settings, dimensionUnit: e.target.value })}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            >
              <option value="cm">Centimeters (cm)</option>
              <option value="in">Inches (in)</option>
            </select>
          </div>
        </div>
      )}

      {/* SEO Settings */}
      {activeTab === 'seo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Meta Title</label>
            <input
              type="text"
              value={settings.metaTitle}
              onChange={(e) => setSettings({ ...settings, metaTitle: e.target.value })}
              placeholder="My Store - Best Products Online"
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Meta Description</label>
            <textarea
              value={settings.metaDescription}
              onChange={(e) => setSettings({ ...settings, metaDescription: e.target.value })}
              placeholder="Shop the best products at great prices..."
              rows={3}
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Google Analytics ID</label>
            <input
              type="text"
              value={settings.googleAnalyticsId}
              onChange={(e) => setSettings({ ...settings, googleAnalyticsId: e.target.value })}
              placeholder="G-XXXXXXXXXX"
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
        </div>
      )}

      {/* Social Media */}
      {activeTab === 'social' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Facebook URL</label>
            <input
              type="url"
              value={settings.facebookUrl}
              onChange={(e) => setSettings({ ...settings, facebookUrl: e.target.value })}
              placeholder="https://facebook.com/yourstore"
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Instagram URL</label>
            <input
              type="url"
              value={settings.instagramUrl}
              onChange={(e) => setSettings({ ...settings, instagramUrl: e.target.value })}
              placeholder="https://instagram.com/yourstore"
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Twitter URL</label>
            <input
              type="url"
              value={settings.twitterUrl}
              onChange={(e) => setSettings({ ...settings, twitterUrl: e.target.value })}
              placeholder="https://twitter.com/yourstore"
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>YouTube URL</label>
            <input
              type="url"
              value={settings.youtubeUrl}
              onChange={(e) => setSettings({ ...settings, youtubeUrl: e.target.value })}
              placeholder="https://youtube.com/yourstore"
              style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
            />
          </div>
        </div>
      )}

      {/* Maintenance */}
      {activeTab === 'maintenance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              id="maintenanceMode"
              checked={settings.maintenanceMode}
              onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
            />
            <label htmlFor="maintenanceMode" style={{ fontSize: '14px', fontWeight: 500 }}>
              Enable Maintenance Mode
            </label>
          </div>
          {settings.maintenanceMode && (
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Maintenance Message</label>
              <textarea
                value={settings.maintenanceMessage}
                onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                placeholder="We're currently performing maintenance. Please check back later."
                rows={3}
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}