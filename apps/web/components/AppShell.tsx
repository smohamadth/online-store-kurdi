'use client';

/**
 * The interactive application shell.
 *
 * This is everything that used to live in app/layout.tsx: Header, MobileMenu,
 * CartIcon, DynamicFooter and the providers. It was extracted so the ROOT
 * LAYOUT could become a server component.
 *
 * Why that mattered: a `'use client'` root layout commits the HTML shell
 * before page rendering finishes, so `notFound()` could still render
 * not-found.tsx but could no longer set the status code. Every unknown
 * category and product URL returned HTTP 200 - a "soft 404" that search
 * engines may index instead of dropping. See KNOWN_GAPS.md section 7.
 *
 * Nothing about the markup or styling changed in the move.
 */

import { CartProvider, useCart } from '@/lib/store';
import { CompareProvider } from '@/lib/compare';
import CompareBar from '@/components/CompareBar';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SearchBar from '@/components/SearchBar';
import { useStoreSettings } from '@/lib/settings';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastContainer } from '@/components/Toast';
import RouteProgress from '@/components/RouteProgress';
import MaintenanceGate from '@/components/MaintenanceGate';
import { ThemeProvider } from '@/lib/theme';
import AnnouncementBar from '@/components/AnnouncementBar';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import CurrencyPicker from '@/components/CurrencyPicker';
import { API_BASE } from '@/lib/http';
import { I18nSeedProvider } from '@/lib/I18nSeedProvider';

// Types
interface MenuItemData {
  id: string;
  label: string;
  url: string;
  icon?: string | null;
  target?: string;
  children?: MenuItemData[];
}

interface MenuData {
  id: string;
  name: string;
  location: string;
  items: MenuItemData[];
}

// Custom hook for mobile detection
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Fetch menu by location from API
function useMenu(location: string) {
  const [menu, setMenu] = useState<MenuData | null>(null);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const response = await fetch(`${API_BASE}/menus/location/${location}`);
        if (response.ok) {
          const data = await response.json();
          if (data.data) {
            setMenu(data.data);
          }
        }
      } catch (err) {
        // API not available, use defaults
      }
    };
    fetchMenu();
  }, [location]);

  return menu;
}

function CartIcon() {
  const { getItemCount } = useCart();
  const count = getItemCount();

  return (
    <Link href="/cart" style={{
      position: 'relative',
      textDecoration: 'none',
      color: 'var(--header-text, #000)',
      display: 'flex',
      alignItems: 'center',
    }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      </svg>
      {count > 0 && (
        <span style={{
          position: 'absolute',
          right: '-8px',
          top: '-8px',
          height: '20px',
          width: '20px',
          borderRadius: '50%',
          backgroundColor: 'var(--brand, #111)',
          color: 'var(--brand-text, #fff)',
          fontSize: '11px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {count}
        </span>
      )}
    </Link>
  );
}

function MobileMenu({ isOpen, onClose, user, onLogout }: {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onLogout: () => void;
}) {
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const headerMenu = useMenu('header');

  // Default menu items if API doesn't return a menu
  const defaultItems: MenuItemData[] = [
    { id: '1', label: 'Products', url: '/products', icon: '📦' },
    { id: '2', label: 'Electronics', url: '/category/electronics', icon: '💻' },
    { id: '3', label: 'Clothing', url: '/category/clothing', icon: '👕' },
    { id: '4', label: 'Blog', url: '/blog', icon: '✍️' },
    { id: '5', label: 'Cart', url: '/cart', icon: '🛒' },
  ];

  const menuItems = headerMenu?.items?.length ? headerMenu.items : defaultItems;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: isOpen ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
      zIndex: 1000,
      opacity: isOpen ? 1 : 0,
      pointerEvents: isOpen ? 'auto' : 'none',
      transition: 'opacity 0.3s ease',
    }} onClick={onClose}>
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '300px',
          maxWidth: '85vw',
          height: '100%',
          backgroundColor: 'var(--card-bg, white)',
          boxShadow: '4px 0 20px rgba(0,0,0,0.1)',
          padding: '24px',
          overflowY: 'auto',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            // Buttons don't inherit colour; without this it is UA black and
            // disappears against a dark drawer.
            color: 'var(--body-text, #111)',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '8px',
          }}
        >
          ✕
        </button>

        {/* User info */}
        {user && (
          <div style={{ 
            marginBottom: '24px', 
            paddingBottom: '24px', 
            borderBottom: '1px solid var(--border, #e5e7eb)',
            marginTop: '32px'
          }}>
            <p style={{ fontWeight: 600, fontSize: '18px' }}>
              {user.firstName} {user.lastName}
            </p>
            <p style={{ color: 'var(--muted, #6b7280)', fontSize: '14px' }}>{user.email}</p>
          </div>
        )}

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {menuItems.map((item) => (
            <div key={item.id}>
              <Link 
                href={item.url} 
                onClick={onClose}
                target={item.target || '_self'}
                style={{ 
                  padding: '12px 16px', 
                  borderRadius: '6px',
                  fontSize: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{item.icon ? `${item.icon} ` : ''}{item.label}</span>
                {item.children && item.children.length > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>›</span>
                )}
              </Link>
              {/* Children */}
              {item.children && item.children.length > 0 && (
                <div style={{ paddingInlineStart: '24px' }}>
                  {item.children.map((child) => (
                    <Link 
                      key={child.id}
                      href={child.url} 
                      onClick={onClose}
                      target={child.target || '_self'}
                      style={{ 
                        padding: '10px 16px', 
                        borderRadius: '6px',
                        fontSize: '14px',
                        display: 'block',
                        color: 'var(--muted, #6b7280)',
                      }}
                    >
                      {child.icon ? `${child.icon} ` : ''}{child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User actions */}
        <div style={{ 
          marginTop: '24px', 
          paddingTop: '24px', 
          borderTop: '1px solid var(--border, #e5e7eb)' 
        }}>
          {user ? (
            <>
              {isAdmin ? (
                <>
                  {/* Admin Panel - only for admins */}
                  <Link 
                    href="/admin" 
                    onClick={onClose}
                    style={{ 
                      display: 'block',
                      padding: '12px 16px', 
                      backgroundColor: 'var(--warning, #d97706)',
                      color: '#fff',
                      borderRadius: '6px',
                      fontSize: '16px',
                      fontWeight: 600,
                      textAlign: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    ⚙️ Admin Panel
                  </Link>
                  <button
                    onClick={() => { onLogout(); onClose(); }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: 'var(--danger, #dc2626)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '16px',
                      cursor: 'pointer',
                    }}
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  {/* Regular user options */}
                  <Link 
                    href="/account" 
                    onClick={onClose}
                    style={{ 
                      display: 'block',
                      padding: '12px 16px', 
                      borderRadius: '6px',
                      fontSize: '16px',
                      marginBottom: '8px',
                    }}
                  >
                    👤 My Account
                  </Link>
                  <Link 
                    href="/account/orders" 
                    onClick={onClose}
                    style={{ 
                      display: 'block',
                      padding: '12px 16px', 
                      borderRadius: '6px',
                      fontSize: '16px',
                      marginBottom: '8px',
                    }}
                  >
                    📦 My Orders
                  </Link>
                  <Link 
                    href="/account/wishlist" 
                    onClick={onClose}
                    style={{ 
                      display: 'block',
                      padding: '12px 16px', 
                      borderRadius: '6px',
                      fontSize: '16px',
                      marginBottom: '16px',
                    }}
                  >
                    ❤️ Wishlist
                  </Link>
                  <button
                    onClick={() => { onLogout(); onClose(); }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: 'var(--danger, #dc2626)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '16px',
                      cursor: 'pointer',
                    }}
                  >
                    Logout
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <Link 
                href="/login" 
                onClick={onClose}
                style={{ 
                  display: 'block',
                  padding: '12px 16px', 
                  backgroundColor: 'var(--brand, #111)',
                  color: 'var(--brand-text, #fff)',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  textAlign: 'center',
                  marginBottom: '12px',
                }}
              >
                Sign In
              </Link>
              <Link 
                href="/register" 
                onClick={onClose}
                style={{ 
                  display: 'block',
                  padding: '12px 16px', 
                  border: '2px solid var(--brand, #111)',
                  borderRadius: '6px',
                  fontSize: '16px',
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Header() {
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith('/admin');
  const { settings } = useStoreSettings();
  const headerMenu = useMenu('header');

  // Default menu items if API doesn't return a menu
  const defaultItems: MenuItemData[] = [
    { id: '1', label: 'Products', url: '/products' },
    { id: '2', label: 'Electronics', url: '/category/electronics' },
    { id: '3', label: 'Clothing', url: '/category/clothing' },
    { id: '4', label: 'Blog', url: '/blog' },
  ];

  const navItems = headerMenu?.items?.length ? headerMenu.items : defaultItems;

  useEffect(() => {
    setMounted(true);
    loadUser();
    
    const handleAuthChange = () => loadUser();
    window.addEventListener('authChange', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);
    
    return () => {
      window.removeEventListener('authChange', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  const loadUser = () => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      
      if (storedUser && token) {
        setUser(JSON.parse(storedUser));
      } else {
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('authChange'));
    window.location.href = '/';
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  // Don't show main header on admin pages
  if (isAdminPage) {
    return null;
  }

  return (
    <>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        width: '100%',
        borderBottom: '1px solid var(--border, #e5e5e5)',
        backgroundColor: 'var(--header-bg, rgba(255,255,255,0.95))',
        color: 'var(--header-text, #111)',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          maxWidth: 'var(--container, 1200px)',
          margin: '0 auto',
          padding: '0 16px',
          display: 'flex',
          height: '64px',
          alignItems: 'center',
          gap: '16px',
        }}>
          {/* Mobile menu button - only show on mobile */}
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          )}

          {/* Logo */}
          <Link href="/" style={{
            textDecoration: 'none',
            color: 'var(--header-text, #000)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{settings.storeName}</span>
          </Link>
          
          {/* Desktop Navigation - hidden on mobile */}
          {!isMobile && (
            <nav style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              fontSize: '14px',
              fontWeight: 500,
            }}>
              {navItems.map((item) => (
                <div
                  key={item.id}
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <Link 
                    href={item.url} 
                    target={item.target || '_self'}
                    style={{ 
                      textDecoration: 'none', 
                      color: 'var(--header-text, #333)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '8px 0',
                    }}
                  >
                    {item.icon ? `${item.icon} ` : ''}{item.label}
                    {item.children && item.children.length > 0 && (
                      <span style={{ fontSize: '10px', marginInlineStart: '2px' }}>▼</span>
                    )}
                  </Link>
                  
                  {/* Dropdown for items with children */}
                  {item.children && item.children.length > 0 && hoveredItem === item.id && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      insetInlineStart: '0',
                      backgroundColor: 'var(--card-bg, white)',
                      border: '1px solid var(--border, #e5e7eb)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      minWidth: '180px',
                      padding: '8px 0',
                      zIndex: 100,
                    }}>
                      {item.children.map((child) => (
                        <Link
                          key={child.id}
                          href={child.url}
                          target={child.target || '_self'}
                          style={{
                            display: 'block',
                            padding: '10px 16px',
                            fontSize: '14px',
                            color: 'var(--header-text, #333)',
                            textDecoration: 'none',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        >
                          {child.icon ? `${child.icon} ` : ''}{child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          )}
          
          {/* Search Bar */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
            <SearchBar />
          </div>
          
          {/* Right side */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}>
            <LanguageSwitcher />
            <CurrencyPicker />
            <CartIcon />
            
            {/* Desktop user menu - hidden on mobile */}
            {!isMobile && mounted && (
              user ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {isAdmin ? (
                    <>
                      <Link href="/admin" style={{ 
                        textDecoration: 'none', 
                        color: '#fff', 
                        fontSize: '14px', 
                        fontWeight: 600,
                        backgroundColor: 'var(--warning, #d97706)',
                        padding: '6px 12px',
                        borderRadius: '4px',
                      }}>
                        ⚙️ Admin Panel
                      </Link>
                      <button
                        onClick={handleLogout}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--danger, #dc2626)',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/account" style={{ textDecoration: 'none', color: 'var(--header-text, #333)', fontSize: '14px' }}>
                        👤 My Account
                      </Link>
                      <Link href="/account/orders" style={{ textDecoration: 'none', color: 'var(--header-text, #333)', fontSize: '14px' }}>
                        Orders
                      </Link>
                      <button
                        onClick={handleLogout}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--danger, #dc2626)',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        Logout
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Link href="/login" style={{ textDecoration: 'none', color: 'var(--header-text, #333)', fontSize: '14px' }}>
                    Sign In
                  </Link>
                  <Link href="/register" style={{
                    textDecoration: 'none',
                    backgroundColor: 'var(--brand, #111)',
                    color: 'var(--brand-text, #fff)',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}>
                    Sign Up
                  </Link>
                </div>
              )
            )}
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        user={user}
        onLogout={handleLogout}
      />
    </>
  );
}

function DynamicFooter() {
  const pathname = usePathname();
  const { settings } = useStoreSettings();
  const footerMenu = useMenu('footer');

  // Admin-authored pages flagged "show in footer", grouped by
  // pageType so each type gets its own URL prefix (info, legal,
  // help). Pages without a recognised type are skipped - they
  // should never exist because the API rejects bad values on
  // create, but a defence-in-depth filter keeps an old / buggy
  // row from rendering a broken footer link.
  const [footerPages, setFooterPages] = useState<
    Array<{ slug: string; title: string; pageType: 'info' | 'legal' | 'help' }>
  >([]);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/pages`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => {
        if (!alive) return;
        setFooterPages(
          (d.data || [])
            .filter(
              (p: any) =>
                p.showInFooter &&
                (p.pageType === 'info' ||
                  p.pageType === 'legal' ||
                  p.pageType === 'help'),
            )
            .map((p: any) => ({
              slug: p.slug,
              title: p.title,
              pageType: p.pageType as 'info' | 'legal' | 'help',
            })),
        );
      })
      .catch(() => {
        // Footer links are decoration - a failure here must not break the page.
      });
    return () => {
      alive = false;
    };
  }, []);

  // The admin panel is a self-contained full-height shell with its own
  // chrome. Rendering the storefront footer under it left a white gap and
  // then a block of shop links that make no sense inside the dashboard.
  // Header already bails out the same way.
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  // Default footer items
  const defaultFooterItems: MenuItemData[] = [
    { id: 'f1', label: 'All Products', url: '/products' },
    { id: 'f2', label: 'Electronics', url: '/category/electronics' },
    { id: 'f3', label: 'Clothing', url: '/category/clothing' },
    { id: 'f4', label: 'Books', url: '/category/books' },
    { id: 'f5', label: 'Blog', url: '/blog' },
  ];

  const footerItems = footerMenu?.items?.length ? footerMenu.items : defaultFooterItems;

  return (
    <footer style={{
      borderTop: '1px solid var(--border, #e5e5e5)',
      backgroundColor: 'var(--footer-bg, #f9f9f9)',
      color: 'var(--footer-text, #111)',
      marginTop: '64px',
    }}>
      <div style={{
        maxWidth: 'var(--container, 1200px)',
        margin: '0 auto',
        padding: '40px 16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '32px',
      }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>{settings.storeName}</h3>
          <p style={{ fontSize: '14px', color: 'var(--muted, #6b7280)' }}>
            {settings.storeDescription}
          </p>
          {settings.storeEmail && (
            <p style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', marginTop: '8px' }}>
              📧 {settings.storeEmail}
            </p>
          )}
          {settings.storePhone && (
            <p style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              📞 {settings.storePhone}
            </p>
          )}
          {settings.storeAddress && (
            <p style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', marginTop: '4px' }}>
              📍 {settings.storeAddress}
            </p>
          )}
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Shop</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {footerItems.map((item) => (
              <div key={item.id}>
                <Link href={item.url} style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>
                  {item.icon ? `${item.icon} ` : ''}{item.label}
                </Link>
                {item.children?.map((child) => (
                  <Link key={child.id} href={child.url} style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', textDecoration: 'none', display: 'block', paddingInlineStart: '16px', marginTop: '4px' }}>
                    {child.icon ? `${child.icon} ` : ''}{child.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Account</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/account" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>My Account</Link>
            <Link href="/account/orders" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Order History</Link>
            <Link href="/account/addresses" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Addresses</Link>
            <Link href="/cart" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Cart</Link>
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Support</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/contact" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Contact Us</Link>
            <Link href="/track-order" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Track Order</Link>
            <Link href="/faq" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>FAQ</Link>
            <Link href="/returns" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Returns</Link>
            {/* Custom help pages the admin flagged for the footer. */}
            {footerPages
              .filter((p) => p.pageType === 'help')
              .map((p) => (
                <Link
                  key={p.slug}
                  href={`/help/${p.slug}`}
                  style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}
                >
                  {p.title}
                </Link>
              ))}
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Legal</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/privacy" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link href="/terms" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Terms of Service</Link>
            {/* Custom legal pages the admin flagged for the footer. */}
            {footerPages
              .filter((p) => p.pageType === 'legal')
              .map((p) => (
                <Link
                  key={p.slug}
                  href={`/legal/${p.slug}`}
                  style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}
                >
                  {p.title}
                </Link>
              ))}
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Info</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/blog" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>Blog</Link>
            {/* Custom info pages the admin flagged for the footer. */}
            {footerPages
              .filter((p) => p.pageType === 'info')
              .map((p) => (
                <Link
                  key={p.slug}
                  href={`/info/${p.slug}`}
                  style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}
                >
                  {p.title}
                </Link>
              ))}
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Connect</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {settings.facebookUrl && (
              <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>
                Facebook
              </a>
            )}
            {settings.instagramUrl && (
              <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>
                Instagram
              </a>
            )}
            {settings.twitterUrl && (
              <a href={settings.twitterUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>
                Twitter
              </a>
            )}
            {settings.youtubeUrl && (
              <a href={settings.youtubeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: 'var(--muted, #6b7280)', textDecoration: 'none' }}>
                YouTube
              </a>
            )}
            {!settings.facebookUrl && !settings.instagramUrl && !settings.twitterUrl && !settings.youtubeUrl && (
              <p style={{ fontSize: '14px', color: 'var(--muted, #6b7280)' }}>Coming soon</p>
            )}
          </div>
        </div>
      </div>
      <div style={{
        borderTop: '1px solid var(--border, #e5e7eb)',
        padding: '20px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '14px', color: 'var(--muted, #6b7280)' }}>
          © {new Date().getFullYear()} {settings.storeName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/**
 * Wraps every page in the providers, header and footer.
 *
 * Rendered from the server root layout inside <body>. The provider order and
 * the markup below are unchanged from the original client root layout.
 */
export default function AppShell({
  children,
  initialLang,
  initialDir,
}: {
  children: React.ReactNode;
  /**
   * The locale the server already resolved for this request. The i18n hook
   * still owns the in-app switching UX; this is just the seed so the first
   * render matches the server-rendered `<html lang dir>` instead of flashing
   * back to English/LTR before the client mount runs.
   */
  initialLang?: string;
  initialDir?: 'ltr' | 'rtl';
}) {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith('/admin');

  // If the server didn't tell us a locale (e.g. an AppShell rendered outside
  // the production layout in a test fixture), fall back to the i18n defaults
  // so the first paint is at least self-consistent.
  const seed = { lang: initialLang ?? 'en', dir: initialDir ?? 'ltr' };

  return (
    <I18nSeedProvider value={seed}>
      {/*
        Outer flex column: a flex layout lets the <main> region grow to fill
        any leftover vertical space instead of reserving a magic-number
        height. Previously <main> used `minHeight: calc(100vh - 64px - 200px)`
        to keep short pages from looking stranded above the footer, but the
        200px was a hard-coded guess for footer height and broke on tall
        footers (lots of menu items, narrow viewports that wrap columns).
        The flex layout below measures everything: header at its natural
        height, footer at its natural height, main fills the gap.
      */}
      <ErrorBoundary>
        <ThemeProvider>
          <RouteProgress />
          <ToastContainer />
          <div
            data-app-shell
            style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100vh',
            }}
          >
            <CartProvider>
              <CompareProvider>
              <AnnouncementBar />
              <Header />

              {/* Main Content */}
              <main
                style={{
                  // `flex: 1 0 auto` makes the main region grow to claim
                  // leftover space, pushing the footer to the bottom of the
                  // viewport on short pages. On long pages the main
                  // region is content-height and the page scrolls normally.
                  flex: '1 0 auto',
                  // Min-height kept for the case where the user has the
                  // admin shell nested - admin is already 100vh and we
                  // don't want a stranded gap.
                  ...(isAdminPage ? {} : {}),
                }}
              >
                <ErrorBoundary>
                  <MaintenanceGate>{children}</MaintenanceGate>
                </ErrorBoundary>
              </main>

              {/* Footer */}
              <DynamicFooter />
              <CompareBar />
              </CompareProvider>
            </CartProvider>
          </div>
        </ThemeProvider>
      </ErrorBoundary>
    </I18nSeedProvider>
  );
}
