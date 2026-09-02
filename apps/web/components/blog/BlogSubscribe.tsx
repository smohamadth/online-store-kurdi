// Blog subscribe box — end-of-post email capture.
//
// Same endpoint the home-page newsletter block uses; kept as a small
// self-contained client so the (server) blog post page can embed it
// without shipping the whole home-page subscribe state machine.

'use client';

import { useState } from 'react';
import { API_BASE } from '@/lib/http';

type Status = 'idle' | 'loading' | 'success' | 'error';

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: '180px',
  padding: '12px 14px',
  border: 'none',
  borderRadius: 0,
  fontSize: '15px',
  backgroundColor: 'transparent',
  color: 'var(--body-text, #111)',
  outline: 'none',
};

export default function BlogSubscribe() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'Thank you — please check your inbox to confirm.');
      } else {
        setStatus('error');
        setMessage(data.message || `Could not subscribe (${res.status}).`);
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  return (
    <section
      aria-label="Subscribe to the blog"
      style={{
        maxWidth: '760px',
        margin: '44px auto 0',
        padding: '26px 28px',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 'calc(var(--radius, 10px) + 4px)',
        backgroundColor: 'var(--card-bg, #fff)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '24px', lineHeight: 1 }}>✉️</div>
      <h2
        style={{
          margin: '10px 0 0',
          fontSize: '19px',
          fontWeight: 'var(--heading-weight, 800)',
          color: 'var(--body-text, #111)',
        }}
      >
        Never miss a post
      </h2>
      <p style={{ margin: '6px auto 0', fontSize: '14px', color: 'var(--muted, #666)', maxWidth: '46ch' }}>
        Guides, product drops and store news — straight to your inbox. No spam, unsubscribe anytime.
      </p>

      {status === 'success' ? (
        <p
          role="status"
          style={{
            marginTop: '16px',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--success-text, #047857)',
          }}
        >
          ✓ {message}
        </p>
      ) : (
        <form
          onSubmit={submit}
          style={{
            marginTop: '18px',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              flex: '1 1 300px',
              maxWidth: '430px',
              border: '1px solid var(--border, #e2e5ea)',
              borderRadius: 'var(--btn-radius, 8px)',
              overflow: 'hidden',
              backgroundColor: 'var(--body-bg, #fff)',
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              style={{
                padding: '12px 22px',
                border: 'none',
                borderRadius: 0,
                backgroundColor: 'var(--brand, #111)',
                color: 'var(--brand-text, #fff)',
                fontSize: '14.5px',
                fontWeight: 700,
                cursor: status === 'loading' ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
            </button>
          </div>
        </form>
      )}

      {status === 'error' && (
        <p
          role="alert"
          style={{
            marginTop: '12px',
            fontSize: '13.5px',
            color: 'var(--danger-text, #dc2626)',
          }}
        >
          {message}
        </p>
      )}
    </section>
  );
}
