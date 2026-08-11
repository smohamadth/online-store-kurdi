'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function AccountLayout({
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
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!storedUser || !token) {
      router.push('/login');
      return;
    }

    try {
      setUser(JSON.parse(storedUser));
    } catch (e) {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const isActive = (path: string) => {
    return pathname === path;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const menuItems = [
    { path: '/account', label: 'Dashboard', icon: '📊' },
    { path: '/account/orders', label: 'Orders', icon: '📦' },
    { path: '/account/wishlist', label: 'Wishlist', icon: '❤️' },
    { path: '/account/reviews', label: 'Reviews', icon: '⭐' },
    { path: '/account/profile', label: 'Edit Profile', icon: '✏️' },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Account</span>
      </nav>

      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          display: 'block',
          width: '100%',
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#f5f5f5',
          border: '1px solid #e5e5e5',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        ☰ Account Menu
      </button>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '200px 1fr', 
        gap: '24px' 
      }}>
        {/* Sidebar */}
        <div style={{
          display: sidebarOpen ? 'block' : 'block',
        }}>
          <div style={{
            padding: '24px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: 'white',
            position: 'sticky',
            top: '80px',
          }}>
            {/* User Avatar */}
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

            {/* User Info */}
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', textAlign: 'center' }}>
              {user.firstName} {user.lastName}
            </h2>
            <p style={{ fontSize: '14px', color: '#666', textAlign: 'center', marginBottom: '24px', wordBreak: 'break-all' }}>
              {user.email}
            </p>

            {/* Navigation */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                    color: isActive(item.path) ? '#000' : '#666',
                    backgroundColor: isActive(item.path) ? '#f5f5f5' : 'transparent',
                    fontWeight: isActive(item.path) ? 600 : 400,
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}

              {/* Logout */}
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  window.dispatchEvent(new Event('authChange'));
                  router.push('/');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginTop: '8px',
                  borderTop: '1px solid #e5e5e5',
                  paddingTop: '16px',
                }}
              >
                <span style={{ fontSize: '18px' }}>🚪</span>
                <span>Logout</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ minWidth: 0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
