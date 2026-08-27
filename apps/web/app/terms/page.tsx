'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Terms of Service</h1>
      <p style={{ color: '#666', marginBottom: '32px' }}>Last updated: January 2024</p>

      <div style={{ lineHeight: 1.8, color: '#333' }}>
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>1. Acceptance of Terms</h2>
          <p>By accessing and using this website, you accept and agree to be bound by these Terms of Service. If you do not agree, please do not use our site.</p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>2. Account Registration</h2>
          <ul style={{ paddingInlineStart: '24px' }}>
            <li>You must be at least 18 years old to create an account</li>
            <li>You are responsible for maintaining account security</li>
            <li>You must provide accurate and complete information</li>
            <li>One person may not maintain multiple accounts</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>3. Orders and Payment</h2>
          <ul style={{ paddingInlineStart: '24px' }}>
            <li>All prices are in USD unless otherwise noted</li>
            <li>We reserve the right to cancel orders for any reason</li>
            <li>Payment is required at time of purchase</li>
            <li>We accept major credit cards and PayPal</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>4. Shipping and Delivery</h2>
          <p style={{ marginBottom: '12px' }}>Shipping times are estimates and not guaranteed. We are not responsible for delays caused by shipping carriers or customs.</p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>5. Returns and Refunds</h2>
          <p>Items may be returned within 30 days of delivery. See our <Link href="/returns" style={{ color: '#000' }}>Return Policy</Link> for details.</p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>6. Intellectual Property</h2>
          <p>All content on this site, including text, images, logos, and designs, is our property and protected by copyright law.</p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>7. Limitation of Liability</h2>
          <p>We are not liable for any indirect, incidental, or consequential damages arising from your use of our site or products.</p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>8. Changes to Terms</h2>
          <p>We may update these terms at any time. Continued use of the site after changes constitutes acceptance of the new terms.</p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>9. Contact</h2>
          <p>Questions? <Link href="/contact" style={{ color: '#000' }}>Contact us</Link>.</p>
        </section>
      </div>
    </div>
  );
}
