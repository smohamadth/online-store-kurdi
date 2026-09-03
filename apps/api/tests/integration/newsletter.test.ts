/**
 * Newsletter integration tests.
 *
 * Tests the "already subscribed" path (no double-subscribe), the
 * admin subscriber list, the validation of email shape, and the
 * durability contract (subscribers are NewsletterSubscriber rows, not
 * an in-memory Set).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp, cleanDatabase, authHeader } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('POST /api/newsletter/subscribe', () => {
  it('subscribes a new email', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'sub@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/subscribed/);
  });

  it('is idempotent: a second subscribe of the same email is a no-op', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'x@x.com' });
    const res = await request(app).post('/api/newsletter/subscribe').send({ email: 'x@x.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already/);
    // Exactly ONE row - the re-subscribe must not duplicate it.
    const rows = await mockPrisma.newsletterSubscriber.findMany({ where: { email: 'x@x.com' } });
    expect(rows).toHaveLength(1);
  });

  it('persists the subscriber to the database (survives a restart)', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'persist@example.com' });
    const rows = await mockPrisma.newsletterSubscriber.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('persist@example.com');
  });

  it('400 on an invalid email', async () => {
    const res = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'nope' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/newsletter/subscribers', () => {
  it('refuses anonymous access (401) — subscriber emails are customer data', async () => {
    const res = await request(app).get('/api/newsletter/subscribers');
    expect(res.status).toBe(401);
  });

  it('refuses customers (403)', async () => {
    const { token } = await authHeader();
    const res = await request(app).get('/api/newsletter/subscribers').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns the subscriber list to an admin', async () => {
    // (Note: these must be zod-valid emails - "a@b.c" has a one-letter
    // TLD and is rejected with 400. This test used to pass by accident:
    // both subscribes 400'd, and the count of 2 came from rows leaked
    // by the earlier tests in this file.)
    await request(app).post('/api/newsletter/subscribe').send({ email: 'a@b.com' });
    await request(app).post('/api/newsletter/subscribe').send({ email: 'b@b.com' });
    const { token: adminToken } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/newsletter/subscribers').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.subscribers.sort()).toEqual(['a@b.com', 'b@b.com']);
  });
});

// ---------------------------------------------------------------------------
// Consent + one-click unsubscribe.
//
// The table used to be id/email/createdAt: no way to unsubscribe and no record
// of consent, so the list was legally unmailable under GDPR/CAN-SPAM even
// though the endpoint happily collected addresses.
// ---------------------------------------------------------------------------

describe('newsletter consent record', () => {
  it('stamps consent, source and a truncated IP on signup', async () => {
    await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'Consent@Example.com', source: 'checkout' })
      .expect(200);

    const row = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: 'consent@example.com' },
    });
    expect(row).toBeTruthy();
    expect(row!.status).toBe('subscribed');
    expect(row!.consentAt).toBeTruthy();
    expect(row!.source).toBe('checkout');
    expect(row!.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalises the address so one mailbox cannot appear twice', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'Dup@Example.com' });
    await request(app).post('/api/newsletter/subscribe').send({ email: 'dup@example.COM' });

    const all = await mockPrisma.newsletterSubscriber.findMany({});
    expect(all.filter((r: any) => r.email === 'dup@example.com')).toHaveLength(1);
    expect(all).toHaveLength(1);
  });

  it('rejects a client-supplied source it does not recognise', async () => {
    await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'src@example.com', source: '<script>x</script>' })
      .expect(200);

    const row = await mockPrisma.newsletterSubscriber.findUnique({
      where: { email: 'src@example.com' },
    });
    expect(row!.source).toBe('footer');
  });

  it('gives every subscriber a distinct token', async () => {
    for (const e of ['a@x.com', 'b@x.com', 'c@x.com']) {
      await request(app).post('/api/newsletter/subscribe').send({ email: e });
    }
    const all = await mockPrisma.newsletterSubscriber.findMany({});
    const tokens = new Set(all.map((r: any) => r.unsubscribeToken));
    expect(tokens.size).toBe(3);
  });

  it('does not overwrite the original consent timestamp on a duplicate signup', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'once@x.com' });
    const first = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'once@x.com' } });

    await new Promise((r) => setTimeout(r, 5));
    await request(app).post('/api/newsletter/subscribe').send({ email: 'once@x.com' });
    const second = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'once@x.com' } });

    // consentAt is the evidence of when they first agreed; a later duplicate
    // submission must not move it.
    expect(new Date(second!.consentAt).getTime()).toBe(new Date(first!.consentAt).getTime());
    expect(second!.unsubscribeToken).toBe(first!.unsubscribeToken);
  });
});

describe('GET/POST /api/newsletter/unsubscribe', () => {
  async function subscribe(email: string) {
    await request(app).post('/api/newsletter/subscribe').send({ email }).expect(200);
    const row = await mockPrisma.newsletterSubscriber.findUnique({ where: { email } });
    return row!;
  }

  it('unsubscribes with a valid token, without a session', async () => {
    const row = await subscribe('bye@x.com');
    const res = await request(app).get(`/api/newsletter/unsubscribe?token=${row.unsubscribeToken}`);
    expect(res.status).toBe(200);

    const after = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'bye@x.com' } });
    expect(after!.status).toBe('unsubscribed');
    expect(after!.unsubscribedAt).toBeTruthy();
  });

  it('works over POST too (mail clients issue both)', async () => {
    const row = await subscribe('post@x.com');
    await request(app).post('/api/newsletter/unsubscribe').send({ token: row.unsubscribeToken }).expect(200);

    const after = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'post@x.com' } });
    expect(after!.status).toBe('unsubscribed');
  });

  it('keeps the row instead of deleting it', async () => {
    // Deleting would let a later signup silently re-add someone who opted out,
    // and destroys the proof that they left.
    const row = await subscribe('keep@x.com');
    await request(app).get(`/api/newsletter/unsubscribe?token=${row.unsubscribeToken}`).expect(200);

    const after = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'keep@x.com' } });
    expect(after).not.toBeNull();
  });

  it('answers identically for an unknown token, so it is not a membership oracle', async () => {
    await subscribe('real@x.com');
    const good = await request(app).get('/api/newsletter/unsubscribe?token=' + 'f'.repeat(64));
    const bad = await request(app).get('/api/newsletter/unsubscribe?token=deadbeef');
    expect(good.status).toBe(200);
    expect(bad.status).toBe(200);
    expect(good.body.message).toBe(bad.body.message);
  });

  it('400s when the token is missing entirely', async () => {
    const res = await request(app).get('/api/newsletter/unsubscribe');
    expect(res.status).toBe(400);
  });

  it('is idempotent - unsubscribing twice is not an error', async () => {
    const row = await subscribe('twice@x.com');
    await request(app).get(`/api/newsletter/unsubscribe?token=${row.unsubscribeToken}`).expect(200);
    const at = (await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'twice@x.com' } }))!.unsubscribedAt;

    await new Promise((r) => setTimeout(r, 5));
    await request(app).get(`/api/newsletter/unsubscribe?token=${row.unsubscribeToken}`).expect(200);
    const after = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'twice@x.com' } });

    expect(after!.status).toBe('unsubscribed');
    // The first unsubscribe time is preserved rather than bumped.
    expect(new Date(after!.unsubscribedAt).getTime()).toBe(new Date(at).getTime());
  });

  it("one subscriber's token cannot unsubscribe another", async () => {
    const a = await subscribe('a1@x.com');
    await subscribe('b1@x.com');
    await request(app).get(`/api/newsletter/unsubscribe?token=${a.unsubscribeToken}`).expect(200);

    const b = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'b1@x.com' } });
    expect(b!.status).toBe('subscribed');
  });
});

describe('resubscribing after opting out', () => {
  it('reactivates and re-stamps consent', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'back@x.com' });
    const first = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'back@x.com' } });
    await request(app).get(`/api/newsletter/unsubscribe?token=${first!.unsubscribeToken}`).expect(200);

    await new Promise((r) => setTimeout(r, 5));
    await request(app).post('/api/newsletter/subscribe').send({ email: 'back@x.com' }).expect(200);

    const after = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'back@x.com' } });
    expect(after!.status).toBe('subscribed');
    expect(after!.unsubscribedAt).toBeNull();
    // Fresh consent, freshly stamped.
    expect(new Date(after!.consentAt).getTime()).toBeGreaterThan(new Date(first!.consentAt).getTime());
    // Old link is dead, so a stale email cannot silently re-opt them out.
    expect(after!.unsubscribeToken).not.toBe(first!.unsubscribeToken);
  });

  it('the retired token no longer unsubscribes them', async () => {
    await request(app).post('/api/newsletter/subscribe').send({ email: 'stale@x.com' });
    const first = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'stale@x.com' } });
    await request(app).get(`/api/newsletter/unsubscribe?token=${first!.unsubscribeToken}`).expect(200);
    await request(app).post('/api/newsletter/subscribe').send({ email: 'stale@x.com' }).expect(200);

    // Replay the OLD link.
    await request(app).get(`/api/newsletter/unsubscribe?token=${first!.unsubscribeToken}`).expect(200);
    const after = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'stale@x.com' } });
    expect(after!.status).toBe('subscribed');
  });
});

describe('GET /api/newsletter/subscribers excludes opt-outs', () => {
  it('omits unsubscribed addresses from the admin export', async () => {
    // This is the failure mode that gets stores fined: exporting the list and
    // mailing it, re-contacting people who opted out.
    await request(app).post('/api/newsletter/subscribe').send({ email: 'in@x.com' });
    await request(app).post('/api/newsletter/subscribe').send({ email: 'out@x.com' });
    const out = await mockPrisma.newsletterSubscriber.findUnique({ where: { email: 'out@x.com' } });
    await request(app).get(`/api/newsletter/unsubscribe?token=${out!.unsubscribeToken}`).expect(200);

    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .get('/api/newsletter/subscribers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.subscribers).toContain('in@x.com');
    expect(res.body.data.subscribers).not.toContain('out@x.com');
    expect(res.body.data.count).toBe(1);
  });
});
