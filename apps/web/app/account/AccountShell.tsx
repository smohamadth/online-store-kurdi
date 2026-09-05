// AccountShell - the wrapper around the /account sub-pages: the
// sidebar/tab navigation (profile, orders, addresses, wishlist,
// reviews, downloads, wallet) + the active-route highlight. The
// login gate lives in the layout (app/account/layout.tsx).

'use client';

import { LoadingState } from '@/components/Spinner';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

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

export default function AccountShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  // Sidebar caret flips with direction so a Kurdish / Arabic visitor
  // sees the down-chevron when the menu is closed and the up-chevron
  // when it's open - the "open" state should point AWAY from the
  // hidden content in both writing systems.
  const { t, direction } = useTranslation();
  const isRtl = direction === 'rtl';
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
        <LoadingState message={t('common.loading')} minHeight={240} />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const menuItems = [
    { path: '/account', label: t('account.dashboard'), icon: '📊' },
    { path: '/account/orders', label: t('account.orders'), icon: '📦' },
    { path: '/account/downloads', label: t('account.downloads'), icon: '⬇️' },
    { path: '/account/wishlist', label: t('account.wishlist'), icon: '❤️' },
    { path: '/account/reviews', label: t('account.reviews'), icon: '⭐' },
    { path: '/account/affiliate', label: t('account.affiliate'), icon: '🤝' },
    { path: '/account/addresses', label: t('account.addresses'), icon: '📍' },
    { path: '/account/profile', label: t('account.profile'), icon: '✏️' },
  ];

  const SidebarContent = () => (
    <div style={{
      padding: isMobile ? '16px' : '24px',
      border: '1px solid var(--border, #e5e5e5)',
      borderRadius: '8px',
      backgroundColor: 'var(--card-bg, white)',
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
        color: 'var(--muted, #666)',
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
              padding: isMobile ? '12px 12px' : '10px 14px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: isActive(item.path) ? '#000' : '#666',
              backgroundColor: isActive(item.path) ? '#f5f5f5' : 'transparent',
              fontWeight: isActive(item.path) ? 600 : 400,
              fontSize: '14px',
              transition: 'all 0.2s',
              // Tap target: nav rows used `padding: 8px 12px` on mobile,
              // which gave ~30px total - below the 36px floor we use
              // everywhere else in the admin shell.
              minHeight: '36px',
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
            padding: isMobile ? '12px 12px' : '10px 14px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: '14px',
            marginTop: '8px',
            borderTop: '1px solid #e5e5e5',
            paddingTop: '14px',
            minHeight: '36px',
          }}
        >
          <span style={{ fontSize: '16px' }}>🚪</span>
          <span>{t('nav.logout')}</span>
        </button>
      </nav>
    </div>
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '16px 12px' : '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--muted, #666)' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--muted, #666)' }}>{t('nav.home')}</Link>
        <span>/</span>
        <span style={{ color: '#000' }}>{t('nav.account')}</span>
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
            border: '1px solid var(--border, #e5e5e5)',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          <span>☰</span>
          <span>{t('account.menu')}</span>
          <span style={{ marginInlineStart: 'auto' }}>
            {sidebarOpen
              ? (isRtl ? '▼' : '▲')
              : (isRtl ? '▲' : '▼')}
          </span>
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
