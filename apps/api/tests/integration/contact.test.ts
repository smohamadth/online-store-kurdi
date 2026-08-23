/**
 * Contact form integration tests.
 *
 * The route stores messages in an in-memory array (not the database),
 * so tests are scoped to validation + the GET listing.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/db';
import { mockPrisma } from '../helpers/mockPrisma';
import type { Express } from 'express';

let app: Express;
beforeAll(async () => { app = await getTestApp(); });
afterAll(async () => { await mockPrisma.$disconnect(); });
beforeEach(async () => { /* nothing to clean, in-memory */ });

describe('POST /api/contact', () => {
  it('accepts a valid submission', async () => {
    const res = await request(app).post('/api/contact').send({
      name: 'Alice',
      email: 'alice@example.com',
      subject: 'Hello',
      message: 'I would like more information about your products, please reply at your convenience.',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/24 hours/);
  });

  it('400 on missing email', async () => {
    const res = await request(app).post('/api/contact').send({
      name: 'A', subject: 'X', message: 'A long enough message body here.',
    });
    expect(res.status).toBe(400);
  });

  it('400 on a too-short message', async () => {
    const res = await request(app).post('/api/contact').send({
      name: 'A', email: 'a@example.com', subject: 'X', message: 'short',
    });
    expect(res.status).toBe(400);
  });

  it('400 on invalid email', async () => {
    const res = await request(app).post('/api/contact').send({
      name: 'A', email: 'not-an-email', subject: 'X', message: 'A sufficiently long message body.',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/contact', () => {
  it('returns the messages newest-first', async () => {
    // Filter to just this test's messages - the route keeps a module-level
    // in-memory array that the other tests' fixtures also live in.
    await request(app).post('/api/contact').send({
      name: 'Alice', email: 'a@example.com', subject: 'CCC-FIRST', message: 'This is the first message body.',
    });
    await request(app).post('/api/contact').send({
      name: 'Bob', email: 'b@example.com', subject: 'CCC-SECOND', message: 'This is the second message body.',
    });
    const res = await request(app).get('/api/contact');
    expect(res.status).toBe(200);
    // Reverse = newest first, so the most recent CCC-* message is at index 0.
    const found = res.body.data.findIndex((m: any) => m.subject === 'CCC-SECOND');
    const prev  = res.body.data.findIndex((m: any) => m.subject === 'CCC-FIRST');
    expect(found).toBeLessThan(prev);
  });
});
