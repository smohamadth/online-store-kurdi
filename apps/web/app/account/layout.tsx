'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

// Mobile detection hook
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

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
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

  // Close sidebar when navigating on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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

  const SidebarContent = () => (
    <div style={{
      padding: isMobile ? '16px' : '24px',
      border: '1px solid #e5e5e5',
      borderRadius: '8px',
      backgroundColor: 'white',
      position: isMobile ? 'static' : 'sticky',
      top: '80px',
    }}>
      {/* User Avatar */}
      <div style={{
        width: isMobile ? '60px' : '80px',
        height: isMobile ? '60px' : '80px',
        borderRadius: '50%',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isMobile ? '24px' : '32px',
        margin: '0 auto 16px',
      }}>
        👤
      </div>

      {/* User Info */}
      <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 'bold', textAlign: 'center' }}>
        {user.firstName} {user.lastName}
      </h2>
      <p style={{ 
        fontSize: '13px', 
        color: '#666', 
        textAlign: 'center', 
        marginBottom: '20px', 
        wordBreak: 'break-all',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {user.email}
      </p>

      {/* Navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {menuItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: isMobile ? '8px 12px' : '10px 14px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: isActive(item.path) ? '#000' : '#666',
              backgroundColor: isActive(item.path) ? '#f5f5f5' : 'transparent',
              fontWeight: isActive(item.path) ? 600 : 400,
              fontSize: isMobile ? '14px' : '14px',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '16px' }}>{item.icon}</span>
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
            gap: '10px',
            padding: isMobile ? '8px 12px' : '10px 14px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: '14px',
            marginTop: '8px',
            borderTop: '1px solid #e5e5e5',
            paddingTop: '14px',
          }}
        >
          <span style={{ fontSize: '16px' }}>🚪</span>
          <span>Logout</span>
        </button>
      </nav>
    </div>
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#666' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#666' }}>Home</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>Account</span>
      </nav>

      {/* Mobile menu button - only show on mobile */}
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            padding: '12px',
            marginBottom: '16px',
            backgroundColor: '#f5f5f5',
            border: '1px solid #e5e5e5',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <span>☰</span>
          <span>Account Menu</span>
          <span style={{ marginLeft: 'auto' }}>{sidebarOpen ? '▲' : '▼'}</span>
        </button>
      )}

      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div style={{ marginBottom: '16px' }}>
          <SidebarContent />
        </div>
      )}

      {/* Desktop layout */}
      {!isMobile ? (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '200px 1fr', 
          gap: '24px',
          alignItems: 'start',
        }}>
          <SidebarContent />
          <div style={{ minWidth: 0 }}>
            {children}
          </div>
        </div>
      ) : (
        /* Mobile layout - no sidebar in grid */
        <div>
          {children}
        </div>
      )}
    </div>
  );
}
