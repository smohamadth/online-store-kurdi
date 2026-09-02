/**
 * The FAQ content, shared by:
 *  - FaqView.tsx (client accordion)
 *  - page.tsx (server-rendered FAQPage JSON-LD — the structured data
 *    must be in the HTML, not added by a client effect, for search
 *    engines to see it)
 */
export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqSection {
  category: string;
  items: FaqItem[];
}

export const faqs: FaqSection[] =
[
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
