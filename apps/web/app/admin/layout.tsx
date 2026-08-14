'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { API_BASE } from '@/lib/http';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

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
  const isMobile = useIsMobile();

  useEffect(() => {
    checkAdminAuth();
  }, []);

  const checkAdminAuth = async () => {
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

      // Verify admin status with server
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!response.ok) {
          throw new Error('Auth verification failed');
        }
        
        const data = await response.json();
        const serverUser = data.data;
        
        if (!serverUser || (serverUser.role !== 'admin' && serverUser.role !== 'manager')) {
          // Clear invalid auth data
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.dispatchEvent(new Event('authChange'));
          router.push('/');
          return;
        }
        
        // Update local user data with server data
        setUser(serverUser);
      } catch (apiError) {
        // API not available, fall back to local check
        console.warn('Admin auth verification API unavailable, using local data');
        if (userData.role !== 'admin' && userData.role !== 'manager') {
          router.push('/');
          return;
        }
        setUser(userData);
      }
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
    { path: '/admin/menus', label: 'Menus', icon: '📑' },
    { path: '/admin/banners', label: 'Gallery & Banners', icon: '🖼️' },
    { path: '/admin/appearance', label: 'Appearance', icon: '🎨' },
    { path: '/admin/shipping', label: 'Shipping', icon: '🚚' },
    { path: '/admin/tax', label: 'Tax', icon: '💰' },
    { path: '/admin/analytics', label: 'Analytics', icon: '📈' },
    { path: '/admin/settings', label: 'Store Settings', icon: '⚙️' },
    { path: '/admin/profile', label: 'My Profile', icon: '👤' },
  ];

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{ padding: '0 24px', marginBottom: '24px', marginTop: isMobile ? '16px' : '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/admin" style={{ textDecoration: 'none', color: 'white' }} onClick={() => isMobile && setSidebarOpen(false)}>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>🛒 Admin Panel</h1>
          </Link>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
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
            onClick={() => isMobile && setSidebarOpen(false)}
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
    </>
  );

  return (
    // The admin panel deliberately opts OUT of the storefront theme.
    // ThemeProvider sets --body-bg / --body-text on :root, which the admin
    // inherited: picking a dark storefront theme turned admin headings into
    // near-invisible light text on white cards. These resets pin the dashboard
    // to its own neutral palette regardless of what the store looks like.
    <div
      data-admin-shell
      style={{
        display: 'flex',
        minHeight: '100vh',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#f5f5f7',
        color: '#111111',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: '16px',
      }}
    >
      {/* Mobile header */}
      {isMobile && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: '#1a1a2e',
          color: 'white',
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
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
          <div style={{ width: '32px' }} />
        </div>
      )}

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar - always visible on desktop, slide-out on mobile */}
        {!isMobile ? (
          <div style={{
            width: '260px',
            backgroundColor: '#1a1a2e',
            color: 'white',
            padding: '24px 0',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'sticky',
            top: 0,
            height: '100vh',
          }}>
            <SidebarContent />
          </div>
        ) : (
          <>
            {/* Mobile sidebar overlay */}
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
          {/* Mobile sidebar */}
          <div style={{
            width: '260px',
            backgroundColor: '#1a1a2e',
            color: 'white',
            padding: '24px 0',
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            zIndex: 1000,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <SidebarContent />
          </div>
          </>
        )}

        {/* Main Content */}
        <div style={{ flex: 1, backgroundColor: '#f5f5f5', overflow: 'auto', minWidth: 0, overflowX: 'hidden' }}>
          {/* Top Bar */}
          <div style={{
            backgroundColor: 'white',
            padding: isMobile ? '12px 16px' : '16px 24px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}>
            <div>
              <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 'bold' }}>
                {menuItems.find(item => isActive(item.path))?.label || 'Dashboard'}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '14px', color: '#666' }}>
                {isMobile ? user.firstName : `Welcome, ${user.firstName}`}
              </span>
            </div>
          </div>

          {/* Page Content */}
          <div style={{ padding: isMobile ? '16px' : '24px' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
