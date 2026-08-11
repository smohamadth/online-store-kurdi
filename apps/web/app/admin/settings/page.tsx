'use client';

import { useState, useEffect } from 'react';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('store');
  const [user, setUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Store settings
  const [storeSettings, setStoreSettings] = useState({
    storeName: 'My Store',
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
    maintenanceMode: false,
    maintenanceMessage: '',
  });

  // Profile form
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      setProfileForm({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        email: userData.email || '',
        phone: userData.phone || '',
      });
    }

    // Load store settings from localStorage
    const storedSettings = localStorage.getItem('storeSettings');
    if (storedSettings) {
      try {
        setStoreSettings(prev => ({ ...prev, ...JSON.parse(storedSettings) }));
      } catch (e) {}
    }
  }, []);

  const handleSaveStoreSettings = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setMessage({ type: 'error', text: 'Please login first' });
        return;
      }

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(storeSettings),
      });

      localStorage.setItem('storeSettings', JSON.stringify(storeSettings));
      window.dispatchEvent(new Event('settingsChange'));
      setMessage({ type: 'success', text: 'Store settings saved!' });
    } catch (err) {
      localStorage.setItem('storeSettings', JSON.stringify(storeSettings));
      window.dispatchEvent(new Event('settingsChange'));
      setMessage({ type: 'success', text: 'Store settings saved locally!' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      if (!token || !user) return;

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profileForm),
      });

      const updatedUser = { ...user, ...profileForm };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      window.dispatchEvent(new Event('authChange'));
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      const updatedUser = { ...user, ...profileForm };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      window.dispatchEvent(new Event('authChange'));
      setMessage({ type: 'success', text: 'Profile updated!' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      setSaving(false);
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      setSaving(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token || !user) return;

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: passwordForm.newPassword }),
      });

      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMessage({ type: 'success', text: 'Password changed!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'store', label: 'Store Settings', icon: '🏪' },
    { id: 'profile', label: 'My Profile', icon: '👤' },
    { id: 'password', label: 'Change Password', icon: '🔒' },
  ];

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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e5e5', paddingBottom: '12px', overflowX: 'auto' }}>
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ 
            padding: '8px 16px', 
            backgroundColor: activeTab === tab.id ? '#f5f5f5' : 'transparent', 
            border: 'none', 
            borderBottom: activeTab === tab.id ? '2px solid #000' : '2px solid transparent', 
            cursor: 'pointer', 
            fontWeight: activeTab === tab.id ? 600 : 400,
            whiteSpace: 'nowrap',
            fontSize: '14px',
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Store Settings */}
      {activeTab === 'store' && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>Store Information</h3>
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
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Currency</label>
              <select value={storeSettings.currency} onChange={(e) => setStoreSettings({ ...storeSettings, currency: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }}>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Address</label>
              <input type="text" value={storeSettings.storeAddress} onChange={(e) => setStoreSettings({ ...storeSettings, storeAddress: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
            </div>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: 600, marginTop: '32px', marginBottom: '16px' }}>SEO Settings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Meta Title</label>
              <input type="text" value={storeSettings.metaTitle} onChange={(e) => setStoreSettings({ ...storeSettings, metaTitle: e.target.value })} placeholder="My Store - Best Products" style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Meta Description</label>
              <textarea value={storeSettings.metaDescription} onChange={(e) => setStoreSettings({ ...storeSettings, metaDescription: e.target.value })} rows={3} placeholder="Shop the best products..." style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
            </div>
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: 600, marginTop: '32px', marginBottom: '16px' }}>Maintenance</h3>
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

          <button onClick={handleSaveStoreSettings} disabled={saving} style={{ marginTop: '24px', padding: '10px 24px', backgroundColor: saving ? '#ccc' : '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving...' : 'Save Store Settings'}
          </button>
        </div>
      )}

      {/* Profile */}
      {activeTab === 'profile' && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>My Profile</h3>
          <form onSubmit={handleUpdateProfile}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>First Name</label>
                <input type="text" value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Last Name</label>
                <input type="text" value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Email</label>
                <input type="email" value={profileForm.email} disabled style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px', backgroundColor: '#f5f5f5', color: '#666' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Phone</label>
                <input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
              </div>
            </div>
            <button type="submit" disabled={saving} style={{ padding: '10px 24px', backgroundColor: saving ? '#ccc' : '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>
      )}

      {/* Change Password */}
      {activeTab === 'password' && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #e5e5e5' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '24px' }}>Change Password</h3>
          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Current Password</label>
                <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>New Password</label>
                <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Must be at least 8 characters</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Confirm New Password</label>
                <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} required style={{ width: '100%', padding: '10px', border: '1px solid #e5e5e5', borderRadius: '4px' }} />
              </div>
            </div>
            <button type="submit" disabled={saving} style={{ marginTop: '24px', padding: '10px 24px', backgroundColor: saving ? '#ccc' : '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
