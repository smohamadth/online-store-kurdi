/**
 * Credentials must not reach the logs, and PII must not be stored in full.
 *
 * Logs are copied to shippers, backups and support tickets - readable by far
 * more people than the database and retained far longer. These drive the real
 * app and inspect what the logger was actually handed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import { logger, loggerStream } from '../../src/utils/logger';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

/** Capture everything written through the logger for one test. */
function captureLogs() {
  const lines: string[] = [];
  const push = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  const spies = [
    vi.spyOn(logger, 'info').mockImplementation(((...a: unknown[]) => { push(...a); return logger; }) as any),
    vi.spyOn(logger, 'error').mockImplementation(((...a: unknown[]) => { push(...a); return logger; }) as any),
    vi.spyOn(logger, 'warn').mockImplementation(((...a: unknown[]) => { push(...a); return logger; }) as any),
  ];
  return {
    lines,
    restore: () => spies.forEach((s) => s.mockRestore()),
    text: () => lines.join('\n'),
  };
}

describe('the access log does not record credentials', () => {
  it('redacts an unsubscribe token passed through morgan', () => {
    // morgan hands the whole request line to loggerStream as one string.
    const cap = captureLogs();
    const token = 'c'.repeat(64);
    loggerStream.write(
      `1.2.3.4 - - [01/Jan/2026] "GET /api/newsletter/unsubscribe?token=${token} HTTP/1.1" 200 15\n`,
    );
    cap.restore();

    expect(cap.text()).not.toContain(token);
    expect(cap.text()).toContain('[REDACTED]');
    // The rest of the line survives, or the access log is worthless.
    expect(cap.text()).toContain('200 15');
  });

  it('leaves ordinary request lines fully readable', () => {
    const cap = captureLogs();
    loggerStream.write('1.2.3.4 - - "GET /api/products?page=2&limit=50 HTTP/1.1" 200 900\n');
    cap.restore();

    expect(cap.text()).toContain('page=2');
    expect(cap.text()).toContain('limit=50');
    expect(cap.text()).not.toContain('[REDACTED]');
  });
});

describe('a real unsubscribe request leaks nothing', () => {
  it('does not write the token when the request succeeds', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'log@x.com' }).expect(200);
    const sub = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: 'log@x.com' },
    });
    const token = sub.unsubscribeToken;

    const cap = captureLogs();
    await request(app).get(`/api/newsletter/unsubscribe?token=${token}`).expect(200);
    cap.restore();

    expect(cap.text()).not.toContain(token);
  });

  it('does not write the token when the request errors', async () => {
    // The error handler logs req.url, so a failure on a tokenised URL is the
    // other way the credential escapes.
    const cap = captureLogs();
    await request(app).get(`/api/newsletter/unsubscribe?token=${'d'.repeat(64)}&boom=1`);
    cap.restore();

    expect(cap.text()).not.toContain('dddd');
  });
});

describe('analytics stores a truncated IP', () => {
  it('drops the final octet on a tracked event', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
    await request(app)
      .post('/api/analytics/track')
      .set('x-session-id', 'sess-ip')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({ eventType: 'view' });

    const events = await mockPrisma.userEvent.findMany({});
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      if (!e.ipAddress) continue;
      // A stored full address is the defect; the truncated form is fine.
      expect(e.ipAddress).not.toBe('203.0.113.42');
      expect(e.ipAddress.endsWith('.0') || e.ipAddress.endsWith('::')).toBe(true);
    }
    delete process.env.ANALYTICS_TRACKING_ENABLED;
  });

  it('never stores an address ending in the identifying octet', async () => {
    process.env.ANALYTICS_TRACKING_ENABLED = 'true';
    await request(app)
      .post('/api/analytics/track')
      .set('x-session-id', 'sess-ip2')
      .set('X-Forwarded-For', '198.51.100.77')
      .send({ eventType: 'search', searchQuery: 'shoes' });

    const events = await mockPrisma.userEvent.findMany({});
    for (const e of events) {
      if (e.ipAddress) expect(e.ipAddress).not.toContain('.77');
    }
    delete process.env.ANALYTICS_TRACKING_ENABLED;
  });
});

describe('the newsletter subscribe path does not log the address', () => {
  it('records the subscription without writing the email to the log', async () => {
    // A log line per signup would build a second copy of the mailing list
    // outside the unsubscribe mechanism - unreachable by any opt-out.
    const cap = captureLogs();
    await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'never-logged@example.com' })
      .expect(200);
    cap.restore();

    expect(cap.text()).not.toContain('never-logged@example.com');
  });
});
