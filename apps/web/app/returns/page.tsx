'use client';

import Link from 'next/link';
import { useIsMobile } from '@/lib/hooks';

export default function ReturnsPage() {
  // The "How to start a return" / "When you'll be refunded" cards
  // sit side by side at 1fr/1fr. Stack under 640px so the prose
  // inside each card gets the full viewport width.
  const isMobile = useIsMobile(640);
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Return Policy</h1>
      <p style={{ color: '#666', marginBottom: '40px' }}>We want you to be completely satisfied with your purchase.</p>

      {/* Return Window */}
      <div style={{
        padding: '24px',
        backgroundColor: '#f0f9ff',
        border: '1px solid #93c5fd',
        borderRadius: '8px',
        marginBottom: '32px',
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>30-Day Return Window</h2>
        <p>You have 30 days from the date of delivery to return most items for a full refund or exchange.</p>
      </div>

      {/* How to Return */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px' }}>How to Return an Item</h2>
        <div style={{ display: 'grid', gap: '16px' }}>
          {[
            { step: '1', title: 'Log into Your Account', desc: 'Go to My Account and find the order you want to return.' },
            { step: '2', title: 'Request a Return', desc: 'Click "Request Return" next to the item and select a reason.' },
            { step: '3', title: 'Print Shipping Label', desc: 'We will email you a prepaid shipping label for eligible returns.' },
            { step: '4', title: 'Ship the Item', desc: 'Pack the item securely and drop it off at the nearest shipping location.' },
            { step: '5', title: 'Receive Your Refund', desc: 'Refunds are processed within 3-5 business days after we receive the item.' },
          ].map((item) => (
            <div key={item.step} style={{ display: 'flex', gap: '16px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#000',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                flexShrink: 0,
              }}>
                {item.step}
              </div>
              <div>
                <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>{item.title}</h3>
                <p style={{ color: '#666', fontSize: '14px' }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Return Conditions */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px' }}>Return Conditions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
          <div style={{ padding: '20px', border: '1px solid #e5e5e5', borderRadius: '8px' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '12px', color: '#22c55e' }}>Eligible for Return</h3>
            <ul style={{ paddingLeft: '20px', fontSize: '14px', color: '#555' }}>
              <li>Unused and in original condition</li>
              <li>Original packaging included</li>
              <li>Tags still attached</li>
              <li>Within 30 days of delivery</li>
            </ul>
          </div>
          <div style={{ padding: '20px', border: '1px solid #e5e5e5', borderRadius: '8px' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '12px', color: '#ef4444' }}>Not Eligible for Return</h3>
            <ul style={{ paddingLeft: '20px', fontSize: '14px', color: '#555' }}>
              <li>Used or worn items</li>
              <li>Digital products (after download)</li>
              <li>Personalized/custom items</li>
              <li>Gift cards</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Refund Timeline */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px' }}>Refund Timeline</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600 }}>Credit Card</p>
            <p style={{ color: '#666', fontSize: '14px' }}>3-5 business days</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600 }}>PayPal</p>
            <p style={{ color: '#666', fontSize: '14px' }}>1-2 business days</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600 }}>Store Credit</p>
            <p style={{ color: '#666', fontSize: '14px' }}>Immediate</p>
          </div>
        </div>
      </section>

      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <p style={{ color: '#666', marginBottom: '16px' }}>Need help with a return?</p>
        <Link href="/contact" style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#000',
          color: '#fff',
          borderRadius: '6px',
          textDecoration: 'none',
          fontWeight: 600,
        }}>
          Contact Support
        </Link>
      </div>
    </div>
  );
}
