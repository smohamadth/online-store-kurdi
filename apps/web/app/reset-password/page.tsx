'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('No reset token provided. Please request a new password reset link.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.message || 'Failed to reset password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ maxWidth: '480px', margin: '64px auto', padding: '0 20px' }}>
        <div style={{
          padding: '40px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'white',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>✅</div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            Password Reset Successfully!
          </h1>
          <p style={{ color: '#666', marginBottom: '32px' }}>
            Your password has been updated. You can now login with your new password.
          </p>
          <Link
            href="/login"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              backgroundColor: '#000',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{ maxWidth: '480px', margin: '64px auto', padding: '0 20px' }}>
        <div style={{
          padding: '40px',
          border: '1px solid #e5e5e5',
          borderRadius: '8px',
          backgroundColor: 'white',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>⚠️</div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            Invalid Reset Link
          </h1>
          <p style={{ color: '#666', marginBottom: '32px' }}>
            This password reset link is invalid or has expired.
          </p>
          <Link
            href="/forgot-password"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              backgroundColor: '#000',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Request New Reset Link
          </Link>
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
        backgroundColor: 'white',
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
          Reset Your Password
        </h1>
        <p style={{ color: '#666', marginBottom: '32px' }}>
          Enter your new password below.
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
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
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

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              required
              minLength={8}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '16px',
                outline: 'none',
              }}
            />
            {password && confirmPassword && password !== confirmPassword && (
              <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                Passwords do not match
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || password !== confirmPassword}
            style={{
              width: '100%',
              padding: '14px 24px',
              backgroundColor: (loading || password !== confirmPassword) ? '#ccc' : '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: (loading || password !== confirmPassword) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
