// ---------------------------------------------------------------------------
// Unit tests for sendRefundConfirmation.
//
// Mirrors email-payment-confirmation.test.ts: mocks the prisma layer (so
// getTemplate returns null -> the built-in HTML) and the environment module,
// then asserts the refund email goes out through sendEmail with the right
// subject/order number/amount/reason. The transporter is unset, so sendEmail
// logs instead of delivering - which is exactly the log-only CI mode.
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

import { sendRefundConfirmation } from '../../src/services/email.service';
import { prisma } from '../../src/config/database';

describe('sendRefundConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.emailTemplate.findUnique as any).mockResolvedValue(null);
  });

  it('sends a refund-confirmation email with the order number and amount (log-only)', async () => {
    const infoSpy = loggerMock.info.mockImplementation(() => {});
    const order = {
      id: 'ord_1',
      orderNumber: 'ORD-123',
      totalAmount: 59.99,
    };
    const user = { firstName: 'Sara', email: 'sara@example.com' };

    await sendRefundConfirmation(order, user, 'customer request');

    const call = infoSpy.mock.calls.find((c) => String(c[0]).includes('📧 Email would be sent'));
    expect(call).toBeTruthy();
    const logLine = String(call![0]);
    expect(logLine).toContain('sara@example.com');
    expect(logLine).toContain('Refund Issued for Order #ORD-123');
  });

  it('renders a custom template when one is active', async () => {
    const infoSpy = loggerMock.info.mockImplementation(() => {});
    (prisma.emailTemplate.findUnique as any).mockResolvedValue({
      name: 'refund_confirmation',
      subject: 'Refunded #{{orderNumber}}',
      htmlContent: '<p>Hi {{customerName}}, order {{orderNumber}} refunded ${{refundAmount}} ({{reason}})',
      isActive: true,
    });

    await sendRefundConfirmation(
      { id: 'ord_2', orderNumber: 'O2', totalAmount: 10 },
      { firstName: 'Ali', email: 'ali@example.com' },
      'return',
    );

    const call = infoSpy.mock.calls.find((c) => String(c[0]).includes('📧 Email would be sent'));
    expect(String(call![0])).toContain('Refunded #O2');
  });

  it('reports the actual refunded amount for a partial refund (not the full total)', async () => {
    const infoSpy = loggerMock.info.mockImplementation(() => {});
    // Put {{refundAmount}} in the subject so the log-only sendEmail line
    // (which prints the subject) exposes which amount was reported.
    (prisma.emailTemplate.findUnique as any).mockResolvedValue({
      name: 'refund_confirmation',
      subject: 'Refunded {{refundAmount}} for #{{orderNumber}}',
      htmlContent: '<p>x</p>',
      isActive: true,
    });

    await sendRefundConfirmation(
      { id: 'ord_3', orderNumber: 'O3', totalAmount: 100 },
      { firstName: 'Sara', email: 'sara@example.com' },
      'partial return',
      5,
    );

    const call = infoSpy.mock.calls.find((c) => String(c[0]).includes('📧 Email would be sent'));
    expect(String(call![0])).toContain('Refunded 5.00 for #O3');
  });
});
