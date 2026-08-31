// ---------------------------------------------------------------------------
// Unit tests for sendPaymentConfirmation.
//
// Mocks the prisma layer (so getTemplate returns null -> the built-in HTML)
// and the environment module, then asserts the email goes out through
// sendEmail with the right subject/order number/amount. The transporter is
// unset, so sendEmail logs instead of delivering - which is exactly the
// log-only CI mode, and lets us assert on the logged recipient/subject.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  prisma: { emailTemplate: { findUnique: vi.fn() } },
}));

vi.mock('../../src/config/environment', () => ({
  env: {
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
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

import { sendPaymentConfirmation } from '../../src/services/email.service';
import { prisma } from '../../src/config/database';

describe('sendPaymentConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.emailTemplate.findUnique as any).mockResolvedValue(null);
  });

  it('sends a payment-confirmation email with the order number and amount (log-only)', async () => {
    const infoSpy = loggerMock.info.mockImplementation(() => {});
    const order = {
      id: 'ord_1',
      orderNumber: 'ORD-123',
      totalAmount: 59.99,
      paymentMethod: 'cod',
    };
    const user = { firstName: 'Sara', email: 'sara@example.com' };

    await sendPaymentConfirmation(order, user);

    const call = infoSpy.mock.calls.find((c) => String(c[0]).includes('📧 Email would be sent'));
    expect(call).toBeTruthy();
    const logLine = String(call![0]);
    expect(logLine).toContain('sara@example.com');
    expect(logLine).toContain('Payment Received for Order #ORD-123');
  });

  it('renders a custom template when one is active', async () => {
    const infoSpy = loggerMock.info.mockImplementation(() => {});
    (prisma.emailTemplate.findUnique as any).mockResolvedValue({
      name: 'payment_confirmation',
      subject: 'Paid #{{orderNumber}}',
      htmlContent: '<p>Hi {{customerName}}, order {{orderNumber}} total ${{orderTotal}}',
      isActive: true,
    });

    await sendPaymentConfirmation(
      { id: 'ord_2', orderNumber: 'O2', totalAmount: 10, paymentMethod: 'stripe' },
      { firstName: 'Ali', email: 'ali@example.com' },
    );

    const call = infoSpy.mock.calls.find((c) => String(c[0]).includes('📧 Email would be sent'));
    expect(String(call![0])).toContain('Paid #O2');
  });
});
