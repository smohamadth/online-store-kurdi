/**
 * Shipping integration tests.
 *
 * Covers zones + methods CRUD, the calculate endpoint, and the lookup.
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

describe('Shipping zones (admin)', () => {
  it('lists zones', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/shipping/zones').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('creates a zone', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app)
      .post('/api/shipping/zones')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Europe', countries: ['DE', 'FR'] });
    expect(res.status).toBe(201);
  });
});

describe('Shipping methods (admin)', () => {
  it('lists methods', async () => {
    const { token } = await authHeader({ role: 'admin' });
    const res = await request(app).get('/api/shipping/methods').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/shipping/calculate (public)', () => {
  it('calculates shipping for a destination', async () => {
    const res = await request(app)
      .post('/api/shipping/calculate')
      .send({ country: 'US', weight: 1 });
    expect(res.status).toBe(200);
  });

  it('tolerates hostile numeric payloads (no NaN/Infinity poisoning)', async () => {
    // Regression: Number('abc') = NaN and Number(Infinity) = Infinity
    // flowed into every comparison, silently dropping/keeping methods;
    // negative weights priced a "negative cart". All of these must
    // behave as 0 — the endpoint returns 200 with an array either way.
    await seedZoneAndMethod({
      name: 'Hostile', type: 'flat', baseRate: 5,
      minOrderAmount: 1, maxOrderAmount: 100,
    });
    for (const payload of [
      { country: 'US', subtotal: 'abc', weight: 'xyz', itemCount: 'zzz' },
      { country: 'US', subtotal: 1e999, weight: Infinity },
      { country: 'US', subtotal: -50, weight: -2, itemCount: -1 },
      { country: 'US', subtotal: 10, weight: [1, 2] },   // Number([1,2]) = NaN
      { country: 'US', subtotal: { a: 1 } },             // Number({}) = NaN
      { country: 'US', weight: null, subtotal: null },
    ]) {
      const res = await request(app).post('/api/shipping/calculate').send(payload);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });
});

describe('POST /api/shipping/zones/lookup (public)', () => {
  it('returns the zone for a country', async () => {
    const res = await request(app)
      .post('/api/shipping/zones/lookup')
      .send({ country: 'US' });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------
// Advanced pricing types (weight / price / item_count) and the
// availability gates (min/max weight, min/max order amount).
// ---------------------------------------------------------------------

async function seedZoneAndMethod(method: any) {
  const zone = await mockPrisma.shippingZone.create({
    data: {
      id: 'zone-' + Date.now(),
      name: 'US',
      countries: JSON.stringify(['US']),
      states: '[]',
      zipCodes: '[]',
      isActive: true,
      sortOrder: 0,
    },
  });
  const created = await mockPrisma.shippingMethod.create({
    data: {
      id: 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      zoneId: zone.id,
      name: method.name,
      type: method.type,
      baseRate: method.baseRate ?? 0,
      weightUnitRate: method.weightUnitRate ?? null,
      minWeight: method.minWeight ?? null,
      maxWeight: method.maxWeight ?? null,
      pricePercentage: method.pricePercentage ?? null,
      itemCountRate: method.itemCountRate ?? null,
      minOrderAmount: method.minOrderAmount ?? null,
      maxOrderAmount: method.maxOrderAmount ?? null,
      freeShippingThreshold: method.freeShippingThreshold ?? null,
      minDeliveryDays: 1,
      maxDeliveryDays: 7,
      isActive: true,
      sortOrder: 0,
    },
  });
  return { zone, method: created };
}

describe('POST /api/shipping/calculate — weight methods', () => {
  it('prices by weight and is gated by min/max weight', async () => {
    const { zone } = await seedZoneAndMethod({
      name: 'Weight', type: 'weight',
      baseRate: 5, weightUnitRate: 2, minWeight: 0, maxWeight: 10,
    });

    // Within the band -> offered with rate = base + weight * unitRate.
    const ok = await request(app).post('/api/shipping/calculate').send({ country: 'US', weight: 5 });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toHaveLength(1);
    expect(ok.body.data[0].name).toBe('Weight');
    expect(ok.body.data[0].rate).toBe(15);

    // Above maxWeight -> the method is not offered.
    const out = await request(app).post('/api/shipping/calculate').send({ country: 'US', weight: 20 });
    expect(out.body.data).toHaveLength(0);
    void zone;
  });

  it('is not offered when no weight is supplied (weight unknown)', async () => {
    await seedZoneAndMethod({
      name: 'Weight2', type: 'weight', baseRate: 5, weightUnitRate: 2,
      minWeight: 1, maxWeight: 10,
    });
    const res = await request(app).post('/api/shipping/calculate').send({ country: 'US' });
    // minWeight=1 with no weight -> 0 weight is below the band.
    expect(res.body.data).toHaveLength(0);
  });
});

describe('POST /api/shipping/calculate — price methods', () => {
  it('applies the percentage and is gated by min/max order amount', async () => {
    await seedZoneAndMethod({
      name: 'Pct', type: 'price', pricePercentage: 10, minOrderAmount: 50,
    });

    const below = await request(app).post('/api/shipping/calculate').send({ country: 'US', subtotal: 20 });
    expect(below.body.data).toHaveLength(0);

    const inRange = await request(app).post('/api/shipping/calculate').send({ country: 'US', subtotal: 100 });
    expect(inRange.body.data).toHaveLength(1);
    expect(inRange.body.data[0].rate).toBe(10);
  });
});

describe('POST /api/shipping/calculate — item_count methods', () => {
  it('prices by the number of items', async () => {
    await seedZoneAndMethod({
      name: 'PerItem', type: 'item_count', baseRate: 5, itemCountRate: 3,
    });
    const res = await request(app).post('/api/shipping/calculate').send({ country: 'US', itemCount: 4 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('PerItem');
    expect(res.body.data[0].rate).toBe(17); // 5 + 4*3
  });
});

describe('POST /api/shipping/calculate — free shipping threshold', () => {
  it('zeroes the rate above the threshold for any method type', async () => {
    await seedZoneAndMethod({
      name: 'Free', type: 'flat', baseRate: 10, freeShippingThreshold: 100,
    });
    const over = await request(app).post('/api/shipping/calculate').send({ country: 'US', subtotal: 150 });
    expect(over.body.data[0].isFree).toBe(true);
    expect(over.body.data[0].rate).toBe(0);
  });
});
