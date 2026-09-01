// /contact - the contact form. Posts to the public POST /api/contact
// (server stores it in-memory and the admin reads the feed there - see
// the API's contact module for that caveat). The form is the only
// client state that matters; success just flips to a thank-you note.
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DirectionArrow } from '@/components/DirectionArrow';
import { useIsMobile } from '@/lib/hooks';
import { API_BASE } from '@/lib/http';

export default function ContactPage() {
  const isMobile = useIsMobile();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitted(true);
      } else {
        setError(data.message || 'Failed to send message');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ maxWidth: '600px', margin: '64px auto', padding: '0 20px', textAlign: 'center' }}>
        <div style={{ padding: '48px', border: '1px solid #e5e5e5', borderRadius: '8px', backgroundColor: 'white' }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>✉️</div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Message Sent!</h1>
          <p style={{ color: '#666', marginBottom: '32px' }}>
            Thank you for contacting us. We will get back to you within 24 hours.
          </p>
          <Link href="/" style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#000',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
          }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Contact Us</h1>
      <p style={{ color: '#666', marginBottom: '40px' }}>
        Have a question or feedback? We'd love to hear from you.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))', gap: isMobile ? '24px' : '40px' }}>
        {/* Contact Info */}
        <div>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Get in Touch</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '20px' }}>📧</span>
                <div>
                  <p style={{ fontWeight: 500 }}>Email</p>
                  <p style={{ color: '#666', fontSize: '14px' }}>support@onlinestore.com</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '20px' }}>📞</span>
                <div>
                  <p style={{ fontWeight: 500 }}>Phone</p>
                  <p style={{ color: '#666', fontSize: '14px' }}>+1 (555) 123-4567</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '20px' }}>⏰</span>
                <div>
                  <p style={{ fontWeight: 500 }}>Business Hours</p>
                  <p style={{ color: '#666', fontSize: '14px' }}>Mon-Fri: 9am - 6pm EST</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>FAQ</h2>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>
              Check our frequently asked questions for quick answers.
            </p>
            <Link href="/faq" style={{
              display: 'inline-block',
              padding: '8px 16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '6px',
              textDecoration: 'none',
              color: '#000',
              fontSize: '14px',
              fontWeight: 500,
            }}>
              <DirectionArrow kind="forward" /> View FAQ
            </Link>
          </div>
        </div>

        {/* Contact Form */}
        <div>
          <form onSubmit={handleSubmit} style={{
            padding: '24px',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            backgroundColor: 'var(--card-bg, white)',
          }}>
            {error && (
              <div style={{
                padding: '12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#ef4444',
                fontSize: '14px',
                marginBottom: '16px',
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Subject *</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Message *</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
                rows={5}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '6px', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: loading ? '#ccc' : '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
