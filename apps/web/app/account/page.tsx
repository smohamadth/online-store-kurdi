'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (!token || !storedUser) {
        router.push('/login');
        return;
      }

      // Parse stored user
      let userData;
      try {
        userData = JSON.parse(storedUser);
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
        return;
      }

      // Verify token is still valid by fetching current user
      try {
        const response = await api.getCurrentUser(token);
        if (response.data) {
          // Update stored user with fresh data
          userData = response.data;
          localStorage.setItem('user', JSON.stringify(userData));
        }
      } catch (err) {
        // Token might be expired - but still show account with stored data
        console.warn('Could not verify token:', err);
      }

      setUser(userData);
    } catch (err) {
      console.error('Auth check error:', err);
      setError('Failed to load account. Please try logging in again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Dispatch custom event to notify other components
    window.dispatchEvent(new Event('authChange'));
    router.push('/');
    router.refresh();
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#666' }}>Loading account...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: '16px' }}>{error}</p>
        <Link href="/login" style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#000',
          color: '#fff',
          borderRadius: '6px',
          textDecoration: 'none',
        }}>
          Go to Login
        </Link>
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
        <span style={{ color: '#000' }}>Account</span>
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
                backgroundColor: '#f5f5f5',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#000',
                fontWeight: 500,
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
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Edit Profile
              </Link>
              <Link href="/wishlist" style={{
                padding: '10px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: '#666',
              }}>
                Wishlist
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  padding: '10px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '14px',
                }}
              >
                Logout
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '32px' }}>
            My Account
          </h1>

          {/* Welcome Card */}
          <div style={{
            padding: '32px',
            backgroundColor: '#f9f9f9',
            borderRadius: '8px',
            marginBottom: '32px',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
              Welcome back, {user.firstName}!
            </h2>
            <p style={{ color: '#666' }}>
              From your account dashboard you can view your recent orders, manage your shipping and billing addresses, and edit your password and account details.
            </p>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <Link href="/account/orders" style={{
              padding: '24px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              textDecoration: 'none',
              color: '#000',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
              <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Orders</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>View order history</p>
            </Link>

            <Link href="/account/profile" style={{
              padding: '24px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              textDecoration: 'none',
              color: '#000',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✏️</div>
              <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Edit Profile</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>Update your info</p>
            </Link>

            <Link href="/wishlist" style={{
              padding: '24px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              textDecoration: 'none',
              color: '#000',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>❤️</div>
              <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Wishlist</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>Saved items</p>
            </Link>

            <Link href="/products" style={{
              padding: '24px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              textDecoration: 'none',
              color: '#000',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛒</div>
              <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Shop</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>Browse products</p>
            </Link>
          </div>

          {/* Account Details */}
          <div style={{ marginTop: '32px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
              Account Details
            </h2>
            <div style={{
              padding: '24px',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Name</p>
                  <p style={{ fontWeight: 500 }}>{user.firstName} {user.lastName}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Email</p>
                  <p style={{ fontWeight: 500 }}>{user.email}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Role</p>
                  <p style={{ fontWeight: 500, textTransform: 'capitalize' }}>{user.role}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Member Since</p>
                  <p style={{ fontWeight: 500 }}>
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}