'use client';

import './globals.css';
import { CartProvider, useCart } from '@/lib/store';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SearchBar from '@/components/SearchBar';

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
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Link 
            href="/products" 
            onClick={onClose}
            style={{ 
              padding: '12px 16px', 
              borderRadius: '6px',
              fontSize: '16px',
              display: 'block',
            }}
          >
            📦 Products
          </Link>
          <Link 
            href="/products?category=electronics" 
            onClick={onClose}
            style={{ 
              padding: '12px 16px', 
              borderRadius: '6px',
              fontSize: '16px',
              display: 'block',
            }}
          >
            💻 Electronics
          </Link>
          <Link 
            href="/products?category=clothing" 
            onClick={onClose}
            style={{ 
              padding: '12px 16px', 
              borderRadius: '6px',
              fontSize: '16px',
              display: 'block',
            }}
          >
            👕 Clothing
          </Link>
          <Link 
            href="/cart" 
            onClick={onClose}
            style={{ 
              padding: '12px 16px', 
              borderRadius: '6px',
              fontSize: '16px',
              display: 'block',
            }}
          >
            🛒 Cart
          </Link>
        </nav>

        {/* User actions */}
        <div style={{ 
          marginTop: '24px', 
          paddingTop: '24px', 
          borderTop: '1px solid #e5e5e5' 
        }}>
          {user ? (
            <>
              {/* Admin Panel - only for admins */}
              {isAdmin && (
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
              )}
              
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
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith('/admin');

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
            <span style={{ fontSize: '20px', fontWeight: 'bold' }}>Store</span>
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
              <Link href="/products" style={{ textDecoration: 'none', color: '#333' }}>
                Products
              </Link>
              <Link href="/products?category=electronics" style={{ textDecoration: 'none', color: '#333' }}>
                Electronics
              </Link>
              <Link href="/products?category=clothing" style={{ textDecoration: 'none', color: '#333' }}>
                Clothing
              </Link>
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
            gap: '16px',
            flexShrink: 0,
          }}>
            <CartIcon />
            
            {/* Desktop user menu - hidden on mobile */}
            {!isMobile && mounted && (
              user ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {isAdmin && (
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
                  )}
                  <Link href="/account" style={{ textDecoration: 'none', color: '#333', fontSize: '14px' }}>
                    👤 My Account
                  </Link>
                  {!isAdmin && (
                    <Link href="/account/orders" style={{ textDecoration: 'none', color: '#333', fontSize: '14px' }}>
                      Orders
                    </Link>
                  )}
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <title>Online Store</title>
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <CartProvider>
          <Header />

          {/* Main Content */}
          <main style={{ minHeight: 'calc(100vh - 64px - 200px)' }}>
            {children}
          </main>

          {/* Footer */}
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
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Store</h3>
                <p style={{ fontSize: '14px', color: '#666' }}>
                  Your one-stop shop for electronics, clothing, books, and digital products.
                </p>
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Shop</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Link href="/products" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>All Products</Link>
                  <Link href="/products?category=electronics" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Electronics</Link>
                  <Link href="/products?category=clothing" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Clothing</Link>
                  <Link href="/products?category=books" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Books</Link>
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Account</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Link href="/account" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>My Account</Link>
                  <Link href="/account/orders" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Order History</Link>
                  <Link href="/cart" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Cart</Link>
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Support</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Link href="/contact" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Contact Us</Link>
                  <Link href="/faq" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>FAQ</Link>
                  <Link href="/shipping" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Shipping Info</Link>
                </div>
              </div>
            </div>
            <div style={{
              borderTop: '1px solid #e5e5e5',
              padding: '20px',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '14px', color: '#666' }}>
                © 2024 Online Store. All rights reserved.
              </p>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
