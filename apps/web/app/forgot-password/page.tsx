'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState(''); // For dev mode

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSent(true);
        // In dev mode, show the token for testing
        if (data.resetToken) {
          setResetToken(data.resetToken);
        }
      } else {
        setError(data.message || 'Failed to send reset email');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div style={{ maxWidth: '480px', margin: '64px auto', padding: '0 20px' }}>
        <div style={{
          padding: '40px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'var(--card-bg, white)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>📧</div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            Check Your Email
          </h1>
          <p style={{ color: '#666', marginBottom: '24px' }}>
            If an account exists with <strong>{email}</strong>, we've sent a password reset link.
          </p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
            The link will expire in 1 hour.
          </p>

          {/* Dev mode: show token for testing */}
          {resetToken && (
            <div style={{
              padding: '16px',
              backgroundColor: '#fef3c7',
              borderRadius: '6px',
              marginBottom: '24px',
              textAlign: 'left',
            }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>
                🔧 Development Mode - Reset Token:
              </p>
              <code style={{
                fontSize: '11px',
                wordBreak: 'break-all',
                color: '#92400e',
              }}>
                {resetToken}
              </code>
              <Link
                href={`/reset-password?token=${resetToken}`}
                style={{
                  display: 'block',
                  marginTop: '12px',
                  fontSize: '14px',
                  color: '#2563eb',
                }}
              >
                → Go to Reset Password Page
              </Link>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Link
              href="/login"
              style={{
                display: 'block',
                padding: '12px 24px',
                backgroundColor: '#000',
                color: '#fff',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Back to Login
            </Link>
            <button
              onClick={() => { setSent(false); setResetToken(''); }}
              style={{
                padding: '12px 24px',
                backgroundColor: 'var(--card-bg, white)',
                color: '#000',
                border: '1px solid #000',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Try Different Email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '480px', margin: '64px auto', padding: '0 20px' }}>
      <div style={{
        padding: '40px',
        border: '1px solid #e5e5e5',
        borderRadius: '8px',
        backgroundColor: 'var(--card-bg, white)',
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
          Forgot Password?
        </h1>
        <p style={{ color: '#666', marginBottom: '32px' }}>
          Enter your email address and we'll send you a link to reset your password.
        </p>

        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#dc2626',
            marginBottom: '24px',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              Email Address
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
                border: '1px solid #e5e5e5',
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
              padding: '14px 24px',
              backgroundColor: loading ? '#ccc' : '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: '#666' }}>
          Remember your password?{' '}
          <Link href="/login" style={{ color: '#000', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
