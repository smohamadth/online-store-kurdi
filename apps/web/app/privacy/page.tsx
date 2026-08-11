'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: '32px' }}>Last updated: January 2024</p>

      <div style={{ lineHeight: 1.8, color: '#333' }}>
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>1. Information We Collect</h2>
          <p style={{ marginBottom: '12px' }}>We collect information you provide directly, including:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '12px' }}>
            <li>Name, email address, and phone number</li>
            <li>Shipping and billing addresses</li>
            <li>Payment information (processed securely by our payment providers)</li>
            <li>Order history and preferences</li>
            <li>Reviews and ratings you submit</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>2. How We Use Your Information</h2>
          <ul style={{ paddingLeft: '24px' }}>
            <li>Process and fulfill your orders</li>
            <li>Send order confirmations and shipping updates</li>
            <li>Provide customer support</li>
            <li>Send marketing communications (with your consent)</li>
            <li>Improve our products and services</li>
            <li>Prevent fraud and ensure security</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>3. Information Sharing</h2>
          <p style={{ marginBottom: '12px' }}>We do not sell your personal information. We may share data with:</p>
          <ul style={{ paddingLeft: '24px' }}>
            <li>Payment processors to complete transactions</li>
            <li>Shipping carriers to deliver orders</li>
            <li>Analytics services to improve our website</li>
            <li>Law enforcement when required by law</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>4. Data Security</h2>
          <p>We implement industry-standard security measures including SSL encryption, secure servers, and regular security audits to protect your personal information.</p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>5. Your Rights</h2>
          <ul style={{ paddingLeft: '24px' }}>
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Opt out of marketing communications</li>
            <li>Export your data</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>6. Cookies</h2>
          <p>We use cookies to remember your preferences, keep you logged in, and analyze site traffic. You can control cookies through your browser settings.</p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>7. Contact Us</h2>
          <p>If you have questions about this privacy policy, please <Link href="/contact" style={{ color: '#000' }}>contact us</Link>.</p>
        </section>
      </div>
    </div>
  );
}
