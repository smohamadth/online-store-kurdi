// /faq - static FAQ accordion (the Q&A live in ./faqData, not the
// CMS; one item open at a time).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { faqs } from './faqData';



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
