'use client';

import type { Metadata } from 'next';
import './globals.css';
import { CartProvider, useCart } from '@/lib/store';

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
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
                <a href="/categories" style={{ textDecoration: 'none', color: '#333' }}>
                  Categories
                </a>
                <a href="/deals" style={{ textDecoration: 'none', color: '#333' }}>
                  Deals
                </a>
              </nav>
              <div style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}>
                <CartIcon />
                <a href="/account" style={{ textDecoration: 'none', color: '#333' }}>
                  Account
                </a>
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
          }}>
            <div style={{
              maxWidth: '1200px',
              margin: '0 auto',
              padding: '40px 20px',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '14px', color: '#666' }}>
                Built with Next.js and Express.js. All rights reserved.
              </p>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}