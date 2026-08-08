'use client';

import './globals.css';
import { CartProvider, useCart } from '@/lib/store';
import { useState, useEffect } from 'react';

function CartIcon() {
  const { getItemCount } = useCart();
  const count = getItemCount();

  return (
    <a href="/cart" style={{
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
    </a>
  );
}

function UserMenu() {
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadUser();
    
    // Listen for custom auth change event
    const handleAuthChange = () => {
      loadUser();
    };
    
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
      console.error('Failed to load user:', e);
      setUser(null);
    }
  };

  if (!mounted) {
    return <div style={{ width: '80px' }} />;
  }

  if (user) {
    const isAdmin = user.role === 'admin' || user.role === 'manager';
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Admin users see admin panel link and logout */}
        {isAdmin && (
          <>
            <a href="/admin" style={{ 
              textDecoration: 'none', 
              color: '#fff', 
              fontSize: '14px', 
              fontWeight: 600,
              backgroundColor: '#f59e0b',
              padding: '6px 12px',
              borderRadius: '4px',
            }}>
              ⚙️ Admin
            </a>
            <button
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.dispatchEvent(new Event('authChange'));
                window.location.href = '/';
              }}
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
        
        {/* Regular users see account and orders */}
        {!isAdmin && (
          <>
            <a href="/account" style={{ 
              textDecoration: 'none', 
              color: '#333', 
              fontSize: '14px',
            }}>
              👤 My Account
            </a>
            <a href="/account/orders" style={{ textDecoration: 'none', color: '#333', fontSize: '14px' }}>
              Orders
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <a href="/login" style={{ textDecoration: 'none', color: '#333', fontSize: '14px' }}>
        Sign In
      </a>
      <a href="/register" style={{
        textDecoration: 'none',
        backgroundColor: '#000',
        color: '#fff',
        padding: '8px 16px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 500,
      }}>
        Sign Up
      </a>
    </div>
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Online Store</title>
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <CartProvider>
          {/* Header */}
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
              padding: '0 20px',
              display: 'flex',
              height: '64px',
              alignItems: 'center',
            }}>
              <a href="/" style={{
                marginRight: '24px',
                display: 'flex',
                alignItems: 'center',
                textDecoration: 'none',
                color: '#000',
              }}>
                <span style={{ fontSize: '20px', fontWeight: 'bold' }}>Store</span>
              </a>
              <nav style={{
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                fontSize: '14px',
                fontWeight: 500,
              }}>
                <a href="/products" style={{ textDecoration: 'none', color: '#333' }}>
                  Products
                </a>
                <a href="/products?category=electronics" style={{ textDecoration: 'none', color: '#333' }}>
                  Electronics
                </a>
                <a href="/products?category=clothing" style={{ textDecoration: 'none', color: '#333' }}>
                  Clothing
                </a>
              </nav>
              <div style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
              }}>
                <CartIcon />
                <UserMenu />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main style={{ minHeight: 'calc(100vh - 64px - 100px)' }}>
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
              padding: '40px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '32px',
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Store</h3>
                <p style={{ fontSize: '14px', color: '#666', maxWidth: '300px' }}>
                  Your one-stop shop for electronics, clothing, books, and digital products.
                </p>
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Shop</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <a href="/products" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>All Products</a>
                  <a href="/products?category=electronics" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Electronics</a>
                  <a href="/products?category=clothing" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Clothing</a>
                  <a href="/products?category=books" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Books</a>
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Account</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <a href="/account" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>My Account</a>
                  <a href="/account/orders" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Order History</a>
                  <a href="/cart" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Cart</a>
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Support</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <a href="/contact" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Contact Us</a>
                  <a href="/faq" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>FAQ</a>
                  <a href="/shipping" style={{ fontSize: '14px', color: '#666', textDecoration: 'none' }}>Shipping Info</a>
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