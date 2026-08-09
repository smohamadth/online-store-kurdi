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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    if (path === '/admin') {
      return pathname === '/admin' || pathname === '/admin/';
    }
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
    { path: '/admin/categories', label: 'Categories', icon: '🏷️' },
    { path: '/admin/orders', label: 'Orders', icon: '🛒' },
    { path: '/admin/inventory', label: 'Inventory', icon: '📋' },
    { path: '/admin/coupons', label: 'Coupons', icon: '🎟️' },
    { path: '/admin/reviews', label: 'Reviews', icon: '⭐' },
    { path: '/admin/users', label: 'Users', icon: '👥' },
    { path: '/admin/shipping', label: 'Shipping', icon: '🚚' },
    { path: '/admin/tax', label: 'Tax', icon: '💰' },
    { path: '/admin/settings', label: 'Settings', icon: '⚙️' },
    { path: '/admin/analytics', label: 'Analytics', icon: '📈' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      {/* Mobile header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: '#1a1a2e',
        color: 'white',
      }}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          ☰
        </button>
        <Link href="/admin" style={{ textDecoration: 'none', color: 'white' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>🛒 Admin Panel</h1>
        </Link>
        <div style={{ width: '32px' }} /> {/* Spacer */}
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <div style={{
          width: '260px',
          backgroundColor: '#1a1a2e',
          color: 'white',
          padding: '24px 0',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'fixed',
          top: 0,
          left: sidebarOpen ? 0 : '-260px',
          height: '100vh',
          zIndex: 1000,
          transition: 'left 0.3s ease',
        }}>
          {/* Logo */}
          <div style={{ padding: '0 24px', marginBottom: '24px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Link href="/admin" style={{ textDecoration: 'none', color: 'white' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>🛒 Admin Panel</h1>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '24px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '12px', color: '#8888aa', marginTop: '4px' }}>
              Online Store Management
            </p>
          </div>

          {/* Navigation */}
          <nav style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '2px', 
            padding: '0 12px',
            flex: 1,
            overflowY: 'auto',
          }}>
            {menuItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  color: isActive(item.path) ? 'white' : '#8888aa',
                  backgroundColor: isActive(item.path) ? '#2d2d4e' : 'transparent',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
                <span style={{ fontSize: '14px', fontWeight: isActive(item.path) ? 600 : 400 }}>
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>

          {/* User Info */}
          <div style={{
            padding: '16px',
            margin: '12px',
            backgroundColor: '#2d2d4e',
            borderRadius: '6px',
            flexShrink: 0,
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
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.firstName} {user.lastName}
                </p>
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

        {/* Sidebar overlay for mobile */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 999,
            }}
          />
        )}

        {/* Main Content */}
        <div style={{ flex: 1, backgroundColor: '#f5f5f5', overflow: 'auto' }}>
          {/* Top Bar */}
          <div style={{
            backgroundColor: 'white',
            padding: '16px 24px',
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
          <div style={{ padding: '24px' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
