'use client';

import './globals.css';
import { Suspense } from 'react';
import { CartProvider, useCart } from '@/lib/store';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SearchBar from '@/components/SearchBar';
import { useStoreSettings } from '@/lib/settings';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastContainer } from '@/components/Toast';
import RouteProgress from '@/components/RouteProgress';
import MaintenanceGate from '@/components/MaintenanceGate';
import LanguageSwitcher from '@/components/LanguageSwitcher';

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
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${API_URL}/menus/location/${location}`);
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
      color: '#000',
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
          backgroundColor: '#000',
          color: '#fff',
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
    { id: '4', label: 'Cart', url: '/cart', icon: '🛒' },
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
          backgroundColor: 'white',
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
            borderBottom: '1px solid #e5e5e5',
            marginTop: '32px'
          }}>
            <p style={{ fontWeight: 600, fontSize: '18px' }}>
              {user.firstName} {user.lastName}
            </p>
            <p style={{ color: '#666', fontSize: '14px' }}>{user.email}</p>
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
                  <span style={{ fontSize: '12px', color: '#999' }}>›</span>
                )}
              </Link>
              {/* Children */}
              {item.children && item.children.length > 0 && (
                <div style={{ paddingLeft: '24px' }}>
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
                        color: '#666',
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
          borderTop: '1px solid #e5e5e5' 
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
                      backgroundColor: '#f59e0b',
                      color: 'white',
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
                      backgroundColor: '#ef4444',
                      color: 'white',
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
                      backgroundColor: '#ef4444',
                      color: 'white',
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
                  backgroundColor: '#000',
                  color: 'white',
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
                  border: '2px solid #000',
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
        borderBottom: '1px solid #e5e5e5',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          maxWidth: '1200px',
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
            color: '#000',
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
                      color: '#333',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '8px 0',
                    }}
                  >
                    {item.icon ? `${item.icon} ` : ''}{item.label}
                    {item.children && item.children.length > 0 && (
                      <span style={{ fontSize: '10px', marginLeft: '2px' }}>▼</span>
                    )}
                  </Link>
                  
                  {/* Dropdown for items with children */}
                  {item.children && item.children.length > 0 && hoveredItem === item.id && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '0',
                      backgroundColor: 'white',
                      border: '1px solid #e5e5e5',
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
                            color: '#333',
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
                        backgroundColor: '#f59e0b',
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
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/account" style={{ textDecoration: 'none', color: '#333', fontSize: '14px' }}>
                        👤 My Account
                      </Link>
                      <Link href="/account/orders" style={{ textDecoration: 'none', color: '#333', fontSize: '14px' }}>
                        Orders
                      </Link>
                      <button
                        onClick={handleLogout}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
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
                  <Link href="/login" style={{ textDecoration: 'none', color: '#333', fontSize: '14px' }}>
                    Sign In
                  </Link>
                  <Link href="/register" style={{
                    textDecoration: 'none',
                    backgroundColor: '#000',
                    color: '#fff',
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
  const { settings } = useStoreSettings();
  const footerMenu = useMenu('footer');

  // Default footer items
  const defaultFooterItems: MenuItemData[] = [
    { id: 'f1', label: 'All Products', url: '/products' },
    { id: 'f2', label: 'Electronics', url: '/category/electronics' },
    { id: 'f3', label: 'Clothing', url: '/category/clothing' },
    { id: 'f4', label: 'Books', url: '/category/books' },
  ];

  const footerItems = footerMenu?.items?.length ? footerMenu.items : defaultFooterItems;

  return (
    <footer style={{
      borderTop: '1px solid #e5e5e5',
      backgroundColor: '#f9f9f9',
      marginTop: '64px',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '40px 16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '32px',
      }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>{settings.storeName}</h3>
          <p style={{ fontSize: '14px', color: '#666' }}>
            {settings.storeDescription}
          </p>
          {settings.storeEmail && (
            <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
              📧 {settings.storeEmail}
            </p>
          )}
          {settings.storePhone && (
            <p style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
              📞 {settings.storePhone}
            </p>
          )}
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Shop</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {footerItems.map((item) => (
              <div key={item.id}>
                <Link href={item.url} style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>
                  {item.icon ? `${item.icon} ` : ''}{item.label}
                </Link>
                {item.children?.map((child) => (
                  <Link key={child.id} href={child.url} style={{ fontSize: '13px', color: '#888', textDecoration: 'none', display: 'block', paddingLeft: '16px', marginTop: '4px' }}>
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
            <Link href="/account" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>My Account</Link>
            <Link href="/account/orders" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Order History</Link>
            <Link href="/account/addresses" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Addresses</Link>
            <Link href="/cart" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Cart</Link>
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Support</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/contact" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Contact Us</Link>
            <Link href="/track-order" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Track Order</Link>
            <Link href="/faq" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>FAQ</Link>
            <Link href="/returns" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Returns</Link>
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Legal</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/privacy" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link href="/terms" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Terms of Service</Link>
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Connect</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {settings.facebookUrl && (
              <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>
                Facebook
              </a>
            )}
            {settings.instagramUrl && (
              <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>
                Instagram
              </a>
            )}
            {settings.twitterUrl && (
              <a href={settings.twitterUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>
                Twitter
              </a>
            )}
            {settings.youtubeUrl && (
              <a href={settings.youtubeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>
                YouTube
              </a>
            )}
            {!settings.facebookUrl && !settings.instagramUrl && !settings.twitterUrl && !settings.youtubeUrl && (
              <p style={{ fontSize: '14px', color: '#666' }}>Coming soon</p>
            )}
          </div>
        </div>
      </div>
      <div style={{
        borderTop: '1px solid #e5e5e5',
        padding: '20px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '14px', color: '#666' }}>
          © {new Date().getFullYear()} {settings.storeName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { settings } = useStoreSettings();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <title>{settings.metaTitle || settings.storeName}</title>
        <meta name="description" content={settings.metaDescription || settings.storeDescription} />
        <meta name="keywords" content="online store, shop, electronics, clothing, books, digital products" />
        <meta name="author" content={settings.storeName} />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={settings.storeName} />
        <meta property="og:locale" content="en_US" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        
        {/* Canonical URL */}
        <link rel="canonical" href={process.env.NEXT_PUBLIC_SITE_URL || 'https://yourstore.com'} />
        
        {/* Favicon */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <ErrorBoundary>
        {/* useSearchParams() must sit inside Suspense or the whole route
            opts out of static rendering and the build errors. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <ToastContainer />
        <CartProvider>
          <Header />

          {/* Main Content */}
          <main style={{ minHeight: 'calc(100vh - 64px - 200px)' }}>
            <ErrorBoundary>
              <MaintenanceGate>
                {children}
              </MaintenanceGate>
            </ErrorBoundary>
          </main>

          {/* Footer */}
          <DynamicFooter />
        </CartProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
