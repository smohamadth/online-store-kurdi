// ---------------------------------------------------------------------------
// initializeEmail() must not install a transport it could not verify.
//
// The bug: `transporter` was assigned BEFORE `await transporter.verify()`.
// When SMTP was unreachable — the default state of any store that has not
// configured SMTP yet, which the roadmap calls the #1 launch blocker — the
// broken transport stayed installed:
//
//   * isEmailConfigured() returned true, so the admin "send test email"
//     button reported "Test email sent successfully" for mail that never
//     left the building;
//   * sendEmail() saw a truthy transporter and took the real-send branch,
//     where sendMail() threw and was swallowed by the catch — so the
//     log-only fallback the module documents never ran, and order
//     confirmations were dropped with no trace beyond an error line.
//
// These tests pin both halves: a failed verify leaves the service honestly
// unconfigured (and still log-only deliverable), a successful verify installs
// the transport.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';

const verify = vi.hoisted(() => vi.fn());
const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ verify, sendMail })));

vi.mock('nodemailer', () => ({
  default: { createTransport },
  createTransport,
}));

vi.mock('../../src/config/database', () => ({
  prisma: { emailTemplate: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

vi.mock('../../src/config/environment', () => ({
  env: {
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    EMAIL_FROM: 'store@test.dev',
    FRONTEND_URL: 'https://store.test',
  },
}));

const loggerMock = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock('../../src/utils/logger', () => ({ logger: loggerMock }));

async function freshModule() {
  vi.resetModules();
  return import('../../src/services/email.service');
}

describe('initializeEmail', () => {
  beforeEach(() => {
    verify.mockReset();
    sendMail.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
  });

  it('reports NOT configured when the SMTP server cannot be verified', async () => {
    verify.mockRejectedValue(new Error('ECONNREFUSED'));
    const mod = await freshModule();

    await mod.initializeEmail();

    // The regression: this used to be true because the transport was
    // assigned before verify() rejected.
    expect(mod.isEmailConfigured()).toBe(false);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('emails will be logged only'),
    );
  });

  it('falls back to logging — not a silent drop — when SMTP is unreachable', async () => {
    verify.mockRejectedValue(new Error('ECONNREFUSED'));
    const mod = await freshModule();
    await mod.initializeEmail();

    const ok = await mod.sendEmail('buyer@example.com', 'Order ORD-1 confirmed', '<p>hi</p>');

    expect(ok).toBe(true);
    // It must take the log-only branch, never the real-send branch.
    expect(sendMail).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.stringContaining('buyer@example.com'),
    );
  });

  it('installs the transport when verification succeeds', async () => {
    verify.mockResolvedValue(true);
    sendMail.mockResolvedValue({ messageId: 'abc123' });
    const mod = await freshModule();

    await mod.initializeEmail();
    expect(mod.isEmailConfigured()).toBe(true);

    const ok = await mod.sendEmail('buyer@example.com', 'Order ORD-1 confirmed', '<p>hi</p>');
    expect(ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('does not leave a stale transport installed across a failed re-init', async () => {
    // A store that had working SMTP and then lost it (rotated credentials,
    // mail host down) must degrade to log-only rather than keep claiming
    // delivery with a transport that now fails.
    verify.mockResolvedValue(true);
    const mod = await freshModule();
    await mod.initializeEmail();
    expect(mod.isEmailConfigured()).toBe(true);

    verify.mockRejectedValue(new Error('535 auth failed'));
    await mod.initializeEmail();
    expect(mod.isEmailConfigured()).toBe(false);
  });
});
