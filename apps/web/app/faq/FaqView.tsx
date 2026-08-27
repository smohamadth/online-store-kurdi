'use client';

import { useState } from 'react';
import Link from 'next/link';

const faqs = [
  {
    category: 'Orders & Shipping',
    items: [
      { q: 'How long does shipping take?', a: 'Standard shipping takes 3-7 business days. Express shipping is 1-3 business days. International shipping may take 7-14 business days.' },
      { q: 'How can I track my order?', a: 'You can track your order by visiting the Track Order page and entering your order number. You can also find tracking info in your account under Orders.' },
      { q: 'Do you offer free shipping?', a: 'Yes! We offer free standard shipping on orders over $100 within the United States.' },
      { q: 'Can I change or cancel my order?', a: 'You can modify or cancel your order within 1 hour of placing it. After that, please contact our support team for assistance.' },
    ]
  },
  {
    category: 'Returns & Refunds',
    items: [
      { q: 'What is your return policy?', a: 'We accept returns within 30 days of delivery. Items must be unused, in original packaging, and in the same condition you received them.' },
      { q: 'How do I return an item?', a: 'Go to your account, find the order, and click "Request Return". We will provide a prepaid shipping label for eligible returns.' },
      { q: 'When will I receive my refund?', a: 'Refunds are processed within 3-5 business days after we receive the returned item. The refund will appear on your original payment method.' },
      { q: 'Can I exchange an item?', a: 'Yes, you can exchange items for a different size or color. Contact our support team to arrange an exchange.' },
    ]
  },
  {
    category: 'Account & Payment',
    items: [
      { q: 'How do I create an account?', a: 'Click "Sign Up" in the top right corner. Fill in your details and you are ready to start shopping!' },
      { q: 'What payment methods do you accept?', a: 'We accept all major credit cards (Visa, Mastercard, American Express), PayPal, and bank transfers.' },
      { q: 'Is my payment information secure?', a: 'Yes! We use industry-standard SSL encryption to protect your payment information. We never store your full credit card details.' },
      { q: 'How do I reset my password?', a: 'Click "Sign In" and then "Forgot Password". Enter your email and we will send you a reset link.' },
    ]
  },
  {
    category: 'Products',
    items: [
      { q: 'How do I find the right size?', a: 'Each product page has a size guide with detailed measurements. If you are between sizes, we recommend sizing up.' },
      { q: 'Are your products authentic?', a: 'Yes, all our products are 100% authentic and sourced directly from authorized distributors and brands.' },
      { q: 'What if an item is out of stock?', a: 'Click the "Notify Me" button on the product page and we will email you when it is back in stock.' },
      { q: 'Can I leave a product review?', a: 'Yes! After purchasing, you can leave a review on the product page. Reviews help other customers make informed decisions.' },
    ]
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);

  const toggleFAQ = (key: string) => {
    setOpenIndex(openIndex === key ? null : key);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Frequently Asked Questions</h1>
      <p style={{ color: '#666', marginBottom: '40px' }}>
        Find answers to common questions about our store, shipping, returns, and more.
      </p>

      {faqs.map((section, sectionIndex) => (
        <div key={sectionIndex} style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', paddingBottom: '8px', borderBottom: '2px solid #000' }}>
            {section.category}
          </h2>
          {section.items.map((faq, faqIndex) => {
            const key = `${sectionIndex}-${faqIndex}`;
            const isOpen = openIndex === key;
            return (
              <div key={faqIndex} style={{
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                marginBottom: '8px',
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => toggleFAQ(key)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '16px 20px',
                    background: isOpen ? '#f9f9f9' : 'white',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'start',
                    fontSize: '15px',
                    fontWeight: 500,
                  }}
                >
                  <span>{faq.q}</span>
                  <span style={{ fontSize: '18px', marginInlineStart: '16px', flexShrink: 0 }}>{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 20px 16px', color: '#555', lineHeight: 1.6, fontSize: '14px' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div style={{
        marginTop: '48px',
        padding: '32px',
        backgroundColor: '#f9f9f9',
        borderRadius: '8px',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>Still have questions?</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Can not find the answer you are looking for? Please contact our support team.
        </p>
        <Link href="/contact" style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#000',
          color: '#fff',
          borderRadius: '6px',
          textDecoration: 'none',
          fontWeight: 600,
        }}>
          Contact Us
        </Link>
      </div>
    </div>
  );
}
