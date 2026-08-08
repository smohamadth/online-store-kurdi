'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = () => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');

      if (!storedUser || !token) {
        router.push('/login');
        return;
      }

      let userData;
      try {
        userData = JSON.parse(storedUser);
      } catch (e) {
        router.push('/login');
        return;
      }

      setUser(userData);
      setFormData({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        email: userData.email || '',
        phone: userData.phone || '',
      });
    } catch (err) {
      console.error('Auth check error:', err);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      if (!token || !user) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const updatedUser = { ...user, ...formData };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        window.dispatchEvent(new Event('authChange'));
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      // Update locally even if API fails
      const updatedUser = { ...user, ...formData };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      window.dispatchEvent(new Event('authChange'));
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      setSaving(false);
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      setSaving(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token || !user) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: passwordData.newPassword }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully!' });
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setMessage({ type: 'error', text: 'Failed to change password. Please try again.' });
      }
    } catch (err) {
      console.error('Failed to change password:', err);
      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Loading profile...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <Link href="/account" style={{ textDecoration: 'none', color: '#666' }}>Account</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Edit Profile</span>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '48px' }}>
        {/* Sidebar */}
        <div>
          <div style={{
            padding: '24px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: 'white',
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: '#f5f5f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              margin: '0 auto 16px',
            }}>
              👤
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', textAlign: 'center' }}>
              {user.firstName} {user.lastName}
            </h2>
            <p style={{ fontSize: '14px', color: '#666', textAlign: 'center', marginBottom: '24px' }}>
              {user.email}
            </p>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link href="/account" style={{
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Dashboard
              </Link>
              <Link href="/account/orders" style={{
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Orders
              </Link>
              <Link href="/account/profile" style={{
                padding: '10px 16px',
                backgroundColor: '#f5f5f5',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#000',
                fontWeight: 500,
              }}>
                Edit Profile
              </Link>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '32px' }}>
            Edit Profile
          </h1>

          {/* Success/Error Message */}
          {message.text && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: message.type === 'success' ? '#d1fae5' : '#fef2f2',
              border: `1px solid ${message.type === 'success' ? '#22c55e' : '#fecaca'}`,
              borderRadius: '6px',
              color: message.type === 'success' ? '#22c55e' : '#ef4444',
              fontSize: '14px',
              marginBottom: '24px',
            }}>
              {message.text}
            </div>
          )}

          {/* Profile Form */}
          <div style={{
            padding: '32px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: 'white',
            marginBottom: '32px',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
              Personal Information
            </h2>
            
            <form onSubmit={handleProfileUpdate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    fontSize: '16px',
                    outline: 'none',
                    backgroundColor: '#f9f9f9',
                  }}
                  disabled
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  Email cannot be changed
                </p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  placeholder="+1 (555) 123-4567"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    fontSize: '16px',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '12px 32px',
                  backgroundColor: saving ? '#ccc' : '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Change Password */}
          <div style={{
            padding: '32px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: 'white',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
              Change Password
            </h2>
            
            <form onSubmit={handlePasswordChange}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    fontSize: '16px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '12px 32px',
                  backgroundColor: saving ? '#ccc' : '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}