// ---------------------------------------------------------------------------
// /login - the storefront sign-in form (register has its own page).
//
// On success the access token + user object go into localStorage and an
// 'authChange' event is dispatched - the components that react to login
// (cart sync, header, AppShell) listen for it; see also
// window.addEventListener('authChange') in lib/store.tsx / AppShell.
// A visitor arriving already logged in is bounced to /account.
// ---------------------------------------------------------------------------
'use client';

import { ButtonSpinner } from '@/components/Spinner';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      // Already logged in, redirect to account
      router.push('/account');
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.login(email, password);
      
      if (response.data?.accessToken) {
        // Store token and user info
        localStorage.setItem('token', response.data.accessToken);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        // Dispatch custom event to notify other components
        window.dispatchEvent(new Event('authChange'));
        
        // Redirect to home
        router.push('/');
        router.refresh();
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message?.includes('fetch')) {
        setError('Cannot connect to server. Please make sure the API is running.');
      } else {
        setError(err.message || 'Invalid email or password');
      }
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div style={{ maxWidth: '480px', margin: '64px auto', padding: '0 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted, #666)' }}>Checking authentication...</p>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '480px',
      margin: '64px auto',
      padding: '0 20px',
    }}>
      <div style={{
        padding: '40px',
        border: '1px solid var(--border, #e5e5e5)',
        borderRadius: '8px',
        backgroundColor: 'var(--card-bg, white)',
      }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }}>
          Welcome Back
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--muted, #666)', marginBottom: '32px' }}>
          Sign in to your account
        </p>

        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#ef4444',
            fontSize: '14px',
            marginBottom: '24px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: '6px',
                fontSize: '16px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '14px', fontWeight: 500 }}>
                Password
              </label>
              <Link href="/forgot-password" style={{ fontSize: '13px', color: 'var(--muted, #666)' }}>
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid var(--border, #e5e5e5)',
                borderRadius: '6px',
                fontSize: '16px',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: loading ? '#ccc' : '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <ButtonSpinner /> Signing in…
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: 'var(--muted, #666)' }}>
            Don't have an account?{' '}
            <Link href="/register" style={{ color: '#000', fontWeight: 500 }}>
              Sign up
            </Link>
          </p>
        </div>

        <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
          <p style={{ fontSize: '12px', color: 'var(--muted, #666)', marginBottom: '8px' }}>Test Accounts:</p>
          <p style={{ fontSize: '12px', color: '#333' }}>
            <strong>Admin:</strong> admin@store.com / admin123
          </p>
          <p style={{ fontSize: '12px', color: '#333' }}>
            <strong>Customer:</strong> customer@example.com / customer123
          </p>
        </div>
      </div>
    </div>
  );
}