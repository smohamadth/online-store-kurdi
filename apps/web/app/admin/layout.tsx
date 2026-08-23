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

  /**
   * Sidebar navigation, grouped.
   *
   * This was a flat list of 16 links in no particular order - "Menus" sat
   * between Users and Banners, Appearance between Banners and Shipping, and
   * finding anything meant reading the whole column. Grouping by job (what you
   * sell / what customers do / how the shop looks / configuration) makes the
   * list scannable and gives the eye somewhere to rest.
   *
   * Order and labels are unchanged where they were already sensible; nothing
   * has been removed, so no existing route becomes unreachable.
   */
  const menuGroups: { heading: string | null; items: { path: string; label: string; icon: string }[] }[] = [
    {
      heading: null,
      items: [{ path: '/admin', label: 'Dashboard', icon: '📊' }],
    },
    {
      heading: 'Catalogue',
      items: [
        { path: '/admin/products', label: 'Products', icon: '📦' },
        { path: '/admin/categories', label: 'Categories', icon: '🏷️' },
        { path: '/admin/inventory', label: 'Inventory', icon: '📋' },
      ],
    },
    {
      heading: 'Selling',
      items: [
        { path: '/admin/orders', label: 'Orders', icon: '🛒' },
        { path: '/admin/coupons', label: 'Coupons', icon: '🎟️' },
        { path: '/admin/gift-cards', label: 'Gift cards', icon: '🎁' },
        { path: '/admin/shipping', label: 'Shipping', icon: '🚚' },
        { path: '/admin/tax', label: 'Tax', icon: '💰' },
      ],
    },
    {
      heading: 'Customers',
      items: [
        { path: '/admin/users', label: 'Users', icon: '👥' },
        { path: '/admin/reviews', label: 'Reviews', icon: '⭐' },
      ],
    },
    {
      heading: 'Storefront',
      items: [
        { path: '/admin/pages', label: 'Pages', icon: '📄' },
        { path: '/admin/blog', label: 'Blog', icon: '✍️' },
        { path: '/admin/appearance', label: 'Appearance', icon: '🎨' },
        { path: '/admin/banners', label: 'Gallery & Banners', icon: '🖼️' },
        { path: '/admin/menus', label: 'Menus', icon: '📑' },
      ],
    },
    {
      heading: 'System',
      items: [
        { path: '/admin/analytics', label: 'Analytics', icon: '📈' },
        { path: '/admin/settings', label: 'Store Settings', icon: '⚙️' },
        { path: '/admin/profile', label: 'My Profile', icon: '👤' },
      ],
    },
  ];

  // Flat list kept for the top-bar title lookup, which searches by path.
  const menuItems = menuGroups.flatMap((g) => g.items);

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{ padding: '0 20px', marginBottom: '16px', marginTop: isMobile ? '16px' : '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/admin" style={{ textDecoration: 'none', color: 'white' }} onClick={() => isMobile && setSidebarOpen(false)}>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>🛒 Admin Panel</h1>
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

      {/* Navigation
          Scrolls independently when the list is taller than the viewport (17
          items do not fit a 700px laptop screen). The mask fades the last few
          pixels so it is obvious there is more below, rather than the list
          appearing to simply stop. The user card below stays pinned. */}
      <nav
        data-admin-nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '0 12px 8px',
          // `flex: 1` (grow AND stretch) made the nav claim every spare pixel,
          // so on a tall screen the list ended at "My Profile" and then ~77px
          // of empty navy sat between it and the user card pinned below.
          //
          // `flex: 0 1 auto` lets the nav SHRINK and scroll when the list is
          // taller than the rail, but take only the height it needs when it
          // is not - so the card sits directly under the last item. The rail
          // itself still fills the viewport, so the colour runs to the bottom;
          // the difference is that the empty space is now below the card
          // rather than inside the nav.
          flex: '0 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: '#3d3d5e transparent',
          WebkitMaskImage:
            'linear-gradient(to bottom, #000 0, #000 calc(100% - 18px), transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, #000 0, #000 calc(100% - 18px), transparent 100%)',
        }}
      >
        {menuGroups.map((group, gi) => (
          <div key={group.heading ?? `group-${gi}`} style={{ marginBottom: '10px' }}>
            {group.heading && (
              <p
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#6b6b8f',
                  padding: '0 16px',
                  margin: '0 0 4px',
                }}
              >
                {group.heading}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {group.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    data-nav-item={item.path}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => isMobile && setSidebarOpen(false)}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '7px 16px',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      color: active ? '#ffffff' : '#a0a0c0',
                      backgroundColor: active ? '#2d2d4e' : 'transparent',
                      transition: 'background-color 0.15s ease, color 0.15s ease',
                    }}
                  >
                    {/* Accent bar: the active row was previously distinguished
                        only by a dark fill, which is easy to miss at a glance. */}
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '18%',
                        bottom: '18%',
                        width: '3px',
                        borderRadius: '0 3px 3px 0',
                        backgroundColor: active ? '#6366f1' : 'transparent',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '16px',
                        width: '22px',
                        textAlign: 'center',
                        flexShrink: 0,
                        lineHeight: 1,
                      }}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: active ? 600 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Info */}
      {/* User panel.
          Sits DIRECTLY under the last nav item and grows to fill whatever rail
          is left, so its background runs to the very bottom.

          Two earlier attempts got this wrong. First the card carried a bottom
          margin, leaving a strip of bare navy under it. Then the nav was left
          as `flex: 1`, which made the LIST claim the spare height and put ~77px
          of dead navy between "My Profile" and the card. Letting the panel take
          the slack removes the empty region entirely rather than moving it. */}
      <div style={{
        // `flex: 1 1 auto` made this panel STRETCH: on a 1300px-tall screen it
        // ran from y=790 to y=1300, i.e. ~510px of lighter navy (#232342)
        // hanging below the Logout button. It reads as a large empty block,
        // which is the gap users report. The panel must be content-height.
        flex: '0 0 auto',
        // Pinned to the bottom of the rail. The slack sits ABOVE the card and
        // is the rail's own #1a1a2e, so it is invisible - unlike the stretched
        // #232342 panel, which read as a large empty block.
        marginTop: 'auto',
        padding: '14px 16px',
        backgroundColor: '#232342',
        borderTop: '1px solid #33335c',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
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

      <div style={{ display: 'flex', flex: 1, alignItems: 'stretch' }}>
        {/* Sidebar - always visible on desktop, slide-out on mobile */}
        {!isMobile ? (
          <div style={{
            width: '260px',
            backgroundColor: '#1a1a2e',
            color: 'white',
            padding: '18px 0 0',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
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
            padding: '18px 0 0',
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
          <div style={{ padding: isMobile ? '16px 16px 0' : '24px 24px 0' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
