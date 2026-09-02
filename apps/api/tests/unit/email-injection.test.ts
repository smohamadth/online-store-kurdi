// ---------------------------------------------------------------------------
// Email injection hardening tests.
//
// Two vectors:
//   1. HEADER INJECTION: a custom subject template that interpolates
//      {{customerName}} lets a customer-controlled firstName (registered as
//      "Bob\r\nBcc: attacker@example.com") inject SMTP headers — unless CR/LF
//      and other control chars are stripped from the subject.
//   2. HTML INJECTION: customer/product names interpolated into email bodies
//      must be HTML-escaped, or a name like `<img src=x onerror=...>` injects
//      markup into the mail the store sends to its own customers.
//
// The transporter is mocked so the tests can inspect the exact subject and
// html that would go over the wire.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: { emailTemplate: { findUnique: vi.fn() } },
}));

vi.mock('../../src/config/environment', () => ({
  env: {
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_USER: '',
    SMTP_PASS: '',
    EMAIL_FROM: 'store@test.dev',
    FRONTEND_URL: 'https://store.test',
  },
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('../../src/utils/logger', () => ({ logger: loggerMock }));

const transporterMock = vi.hoisted(() => ({
  sendMail: vi.fn().mockResolvedValue({ messageId: 'm1' }),
  verify: vi.fn().mockResolvedValue(true),
}));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => transporterMock },
  createTransport: () => transporterMock,
}));

import {
  initializeEmail,
  sendEmail,
  sendPaymentConfirmation,
  renderTemplate,
  renderSubject,
  escapeHtml,
} from '../../src/services/email.service';
import { prisma } from '../../src/config/database';

async function lastMail() {
  expect(transporterMock.sendMail).toHaveBeenCalled();
  return transporterMock.sendMail.mock.calls[transporterMock.sendMail.mock.calls.length - 1][0];
}

describe('renderSubject — header injection', () => {
  it('strips CR/LF from interpolated values', () => {
    const out = renderSubject('Hi {{customerName}}, order #{{orderNumber}}', {
      customerName: 'Bob\r\nBcc: attacker@example.com',
      orderNumber: 'ORD-1',
    });
    // The injected header TEXT may survive, but the CR/LF that would make
    // it a header is gone — the payload is now one flat subject line.
    expect(out).not.toContain('\r');
    expect(out).not.toContain('\n');
    expect(out).toContain('ORD-1');
  });

  it('strips other control characters', () => {
    const out = renderSubject('{{customerName}}', { customerName: 'A\u0000B\tC' });
    expect(out).toBe('ABC');
  });
});

describe('renderTemplate / escapeHtml — HTML injection in bodies', () => {
  it('HTML-escapes values interpolated into templates', () => {
    const out = renderTemplate('<p>Hi {{customerName}}</p>', {
      customerName: '<img src=x onerror=alert(1)>',
    });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    // The surrounding markup survives.
    expect(out.startsWith('<p>Hi ')).toBe(true);
  });

  it('escapeHtml handles the full special-char set', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'
    );
  });
});

describe('wire-level hardening (mocked transporter)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    transporterMock.sendMail.mockResolvedValue({ messageId: 'm1' });
    (prisma.emailTemplate.findUnique as any).mockResolvedValue(null);
    await initializeEmail();
  });

  it('sanitises a custom subject that interpolates the customer name', async () => {
    (prisma.emailTemplate.findUnique as any).mockResolvedValue({
      name: 'payment_confirmation',
      isActive: true,
      subject: 'Payment from {{customerName}}',
      htmlContent: '<p>Hi {{customerName}}</p>',
    });
    await sendPaymentConfirmation(
      { id: 'o1', orderNumber: 'ORD-1', totalAmount: 10, paymentMethod: 'card' },
      { firstName: 'Bob\r\nBcc: attacker@example.com', email: 'bob@test.dev' }
    );
    const mail = await lastMail();
    expect(mail.subject).not.toContain('\r');
    expect(mail.subject).not.toContain('\n');
    // Flat subject text only — no header break possible.
    expect(mail.subject).toBe('Payment from BobBcc: attacker@example.com');
  });

  it('escapes a hostile customer name in the default HTML body', async () => {
    await sendPaymentConfirmation(
      { id: 'o1', orderNumber: 'ORD-1', totalAmount: 10, paymentMethod: 'card' },
      { firstName: '<img src=x onerror=alert(1)>', email: 'bob@test.dev' }
    );
    const mail = await lastMail();
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(mail.html).not.toContain('Hi <img');
  });

  it('escapes hostile product names in the order-confirmation body', async () => {
    (prisma.emailTemplate.findUnique as any).mockResolvedValue(null);
    const { sendOrderConfirmation } = await import('../../src/services/email.service');
    await sendOrderConfirmation(
      {
        id: 'o1',
        orderNumber: 'ORD-1',
        status: 'pending',
        createdAt: new Date(),
        subtotal: 10,
        discountAmount: 0,
        shippingAmount: 2,
        taxAmount: 0,
        totalAmount: 12,
        items: [{ product: { name: '<script>alert(1)</script>' }, quantity: 1, price: 10 }],
        downloads: [],
      },
      { firstName: 'Bob', email: 'bob@test.dev' }
    );
    const mail = await lastMail();
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('sendEmail strips control chars from the subject at the boundary', async () => {
    await sendEmail('bob@test.dev', 'Hi\r\nBcc: attacker@example.com', '<p>body</p>');
    const mail = await lastMail();
    expect(mail.subject).not.toContain('\r');
    expect(mail.subject).not.toContain('\n');
    expect(mail.subject).toBe('HiBcc: attacker@example.com');
    expect(mail.to).toBe('bob@test.dev');
  });
});
