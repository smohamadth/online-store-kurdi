'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useIsMobile } from '@/lib/hooks';

export default function AccountDashboard() {
  const isMobile = useIsMobile();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {}
    }
  }, []);

  if (!user) return null;

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '24px' }}>
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
        <p style={{ color: 'var(--muted, #666)' }}>
          From your account dashboard you can view your recent orders, manage your shipping and billing addresses, and edit your password and account details.
        </p>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
        <Link
          href="/account/wallet"
          data-testid="wallet-link"
          style={{
            padding: '24px',
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '8px',
            textDecoration: 'none',
            color: '#000',
            textAlign: 'center',
            display: 'block',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>💳</div>
          <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Wallet</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>Store credit & gift cards</p>
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px' }}>
        <Link href="/account/orders" style={{
          padding: '24px',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: '8px',
          textDecoration: 'none',
          color: '#000',
          textAlign: 'center',
          display: 'block',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
          <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Orders</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>View order history</p>
        </Link>

        <Link href="/account/wishlist" style={{
          padding: '24px',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: '8px',
          textDecoration: 'none',
          color: '#000',
          textAlign: 'center',
          display: 'block',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>❤️</div>
          <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Wishlist</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>Saved items</p>
        </Link>

        <Link href="/account/profile" style={{
          padding: '24px',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: '8px',
          textDecoration: 'none',
          color: '#000',
          textAlign: 'center',
          display: 'block',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✏️</div>
          <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>Edit Profile</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>Update your info</p>
        </Link>
      </div>

      {/* Account Details */}
      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
          Account Details
        </h2>
        <div style={{
          padding: '24px',
          border: '1px solid var(--border, #e5e5e5)',
          borderRadius: '8px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--muted, #666)', marginBottom: '4px' }}>Name</p>
              <p style={{ fontWeight: 500 }}>{user.firstName} {user.lastName}</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--muted, #666)', marginBottom: '4px' }}>Email</p>
              <p style={{ fontWeight: 500 }}>{user.email}</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--muted, #666)', marginBottom: '4px' }}>Role</p>
              <p style={{ fontWeight: 500, textTransform: 'capitalize' }}>{user.role}</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--muted, #666)', marginBottom: '4px' }}>Member Since</p>
              <p style={{ fontWeight: 500 }}>
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
