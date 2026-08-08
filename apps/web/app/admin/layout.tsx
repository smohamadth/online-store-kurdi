'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = () => {
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

      // Check if user is admin
      if (userData.role !== 'admin' && userData.role !== 'manager') {
        router.push('/');
        return;
      }

      setUser(userData);
    } catch (err) {
      console.error('Auth check error:', err);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('authChange'));
    router.push('/');
    router.refresh();
  };

  const isActive = (path: string) => {
    return pathname === path || pathname?.startsWith(path + '/');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ color: '#666' }}>Loading admin panel...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const menuItems = [
    { path: '/admin', label: 'Dashboard', icon: '📊' },
    { path: '/admin/products', label: 'Products', icon: '📦' },
    { path: '/admin/orders', label: 'Orders', icon: '🛒' },
    { path: '/admin/coupons', label: 'Coupons', icon: '🎟️' },
    { path: '/admin/users', label: 'Users', icon: '👥' },
    { path: '/admin/analytics', label: 'Analytics', icon: '📈' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <div style={{
        width: '260px',
        backgroundColor: '#1a1a2e',
        color: 'white',
        padding: '24px 0',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Logo */}
        <div style={{ padding: '0 24px', marginBottom: '32px' }}>
          <Link href="/admin" style={{ textDecoration: 'none', color: 'white' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>🛒 Admin Panel</h1>
          </Link>
          <p style={{ fontSize: '12px', color: '#8888aa', marginTop: '4px' }}>
            Online Store Management
          </p>
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' }}>
          {menuItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '6px',
                textDecoration: 'none',
                color: isActive(item.path) ? 'white' : '#8888aa',
                backgroundColor: isActive(item.path) ? '#2d2d4e' : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              <span style={{ fontSize: '14px', fontWeight: isActive(item.path) ? 600 : 400 }}>
                {item.label}
              </span>
            </Link>
          ))}
        </nav>

        {/* User Info */}
        <div style={{
          position: 'absolute',
          bottom: '24px',
          left: '12px',
          right: '12px',
          padding: '16px',
          backgroundColor: '#2d2d4e',
          borderRadius: '6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#4a4a6a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}>
              👤
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600 }}>{user.firstName} {user.lastName}</p>
              <p style={{ fontSize: '12px', color: '#8888aa', textTransform: 'capitalize' }}>{user.role}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/" style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px',
              backgroundColor: '#4a4a6a',
              borderRadius: '4px',
              textDecoration: 'none',
              color: 'white',
              fontSize: '12px',
            }}>
              View Store
            </Link>
            <button
              onClick={handleLogout}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#ef4444',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, backgroundColor: '#f5f5f5', overflow: 'auto' }}>
        {/* Top Bar */}
        <div style={{
          backgroundColor: 'white',
          padding: '16px 32px',
          borderBottom: '1px solid #e5e5e5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {menuItems.find(item => isActive(item.path))?.label || 'Dashboard'}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>
              Welcome, {user.firstName}
            </span>
          </div>
        </div>

        {/* Page Content */}
        <div style={{ padding: '32px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}