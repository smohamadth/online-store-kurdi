'use client';

import Link from 'next/link';

/**
 * Privacy Policy.
 *
 * Written against what the code actually does (not an idealised store):
 *   - no third-party analytics by default; GA4 only if the store owner
 *     configures a property id (see lib/seo.ts buildGtagSnippet)
 *   - behavioural event tracking (/api/analytics/track) is OFF unless the
 *     API runs with ANALYTICS_TRACKING_ENABLED=true - with the flag unset
 *     the endpoints 404, so nothing is collected
 *   - login state and preferences live in the browser's localStorage,
 *     the API sets no tracking cookies
 *   - every API request still carries an IP address and user agent in
 *     the server log (standard web logging)
 *
 * If you change any of the above, change this page in the same commit.
 */
export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Privacy Policy</h1>
      <p style={{ color: '#666', marginBottom: '32px' }}>Last updated: 29 August 2026</p>

      <div style={{ lineHeight: 1.8, color: '#333' }}>
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>1. Information We Collect</h2>
          <p style={{ marginBottom: '12px' }}>
            We collect only what the store needs to operate, in three categories:
          </p>
          <ul style={{ paddingInlineStart: '24px', marginBottom: '12px' }}>
            <li>
              <strong>What you give us directly</strong> — your name, email address, password (stored only
              as a one-way hash, never in plain text), shipping and billing addresses, order history,
              and any reviews or contact messages you submit.
            </li>
            <li>
              <strong>Server logs</strong> — like most websites, every request to our servers is logged
              with its IP address and browser user agent. These logs are used for security,
              troubleshooting and preventing abuse. Search terms you type appear in the logs only
              when debug-level logging is switched on.
            </li>
            <li>
              <strong>Behavioural events — only if this store has enabled event tracking</strong>.
              The store&apos;s event-tracking feature is <strong>off by default</strong>: with it
              disabled the tracking endpoints do not exist, so no browsing data is collected at all.
              If the store owner has enabled it, we record, per event: the event type (for example a
              product view or an add-to-cart), the related product or category, the search text for
              search events, a session identifier, and — when you are signed in — a link to your
              account. Each event also carries your IP address and user agent.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>2. How We Use Your Information</h2>
          <ul style={{ paddingInlineStart: '24px' }}>
            <li>Process and fulfil your orders and send order updates</li>
            <li>Provide customer support</li>
            <li>Prevent fraud and keep the store secure</li>
            <li>
              When event tracking is enabled: power the store owner&apos;s own analytics dashboard and
              in-store product recommendations (for example &ldquo;frequently bought together&rdquo;).
              This data is used only inside this store — it is not sold, rented or shared with
              advertising networks, and it is not combined with data from other websites.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>3. Information Sharing</h2>
          <p style={{ marginBottom: '12px' }}>We do not sell your personal information. We share data only with:</p>
          <ul style={{ paddingInlineStart: '24px' }}>
            <li>Payment processors (for example Stripe, when card payment is configured) to complete transactions</li>
            <li>Shipping carriers to deliver orders</li>
            <li>Google Analytics, <strong>only if</strong> this store has configured it — in that case page-view data is processed by Google under Google&apos;s privacy policy</li>
            <li>Law enforcement, where required by law</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>4. Cookies and Browser Storage</h2>
          <p style={{ marginBottom: '12px' }}>
            We do <strong>not</strong> use tracking cookies. The API sets no cookies at all.
          </p>
          <p style={{ marginBottom: '12px' }}>
            Your browser&apos;s local storage (visible in your browser settings) is used to keep,
            entirely on your device: your sign-in session, your cart, items you are comparing or have
            viewed recently, and your language, currency and theme preferences. Clearing your
            browser data removes all of it; it never reaches our servers except as part of the
            normal requests your browser makes.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>5. Data Retention</h2>
          <p>
            Account and order data is kept while your account exists and as required to honour
            orders and tax law. When event tracking is enabled, event data is kept until you
            request deletion or the store owner removes it; real-time counters derived from events
            expire after 24 hours. Server logs are kept on our servers and rotated by the host.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>6. Data Security</h2>
          <p>
            We transmit data over TLS/HTTPS, hash passwords with a slow one-way algorithm so they
            cannot be read even by our own database, and limit access to customer data to
            staff accounts with role-based permissions. No system is perfectly secure, but these
            are the controls in place.
          </p>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>7. Your Rights</h2>
          <ul style={{ paddingInlineStart: '24px' }}>
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data (including behavioural events, where tracking is enabled)</li>
            <li>Export your data</li>
          </ul>
        </section>

        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>8. Contact Us</h2>
          <p>
            If you have questions about this privacy policy or want to exercise any of the rights
            above, please <Link href="/contact" style={{ color: '#000' }}>contact us</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
