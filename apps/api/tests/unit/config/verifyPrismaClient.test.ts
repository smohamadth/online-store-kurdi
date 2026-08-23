/**
 * verifyPrismaClient — fail-fast on a stale generated client.
 *
 * The point of this guard is that the symptom of a stale client is a
 * generic "Cannot read properties of undefined" inside a route handler.
 * That looks like an application bug, when really you need to re-run
 * prisma generate. Tests assert the detection + the help text.
 */
import { describe, it, expect } from 'vitest';
import {
  findMissingModels,
  assertPrismaClientIsCurrent,
  StalePrismaClientError,
  stalePrismaClientHelp,
  REQUIRED_MODELS,
} from '../../../src/config/verifyPrismaClient';

function makeFakeClient(present: string[]): any {
  // Each "model" on the real client exposes at least one query method
  // (findFirst). Anything else is what a stale client looks like.
  const out: any = {};
  for (const m of present) {
    out[m] = { findFirst: () => {} };
  }
  return out;
}

describe('REQUIRED_MODELS', () => {
  it('includes the models every route touches', () => {
    // If a test breaks here, add the new model to REQUIRED_MODELS in
    // the source file too - the assert at startup is what protects
    // against the "looks-like-an-app-bug" symptom in production.
    for (const m of [
      'user', 'product', 'category', 'order', 'orderItem', 'cartItem',
      'wishlistItem', 'review', 'address', 'coupon', 'session',
      'passwordReset', 'inventoryLog', 'stockAlert', 'themeSettings',
      'homeSection', 'menu', 'menuItem', 'banner',
    ]) {
      expect(REQUIRED_MODELS).toContain(m);
    }
  });
});

describe('findMissingModels', () => {
  it('returns the union when none of the required models are present', () => {
    const missing = findMissingModels({} as any);
    expect(missing.length).toBe(REQUIRED_MODELS.length);
  });

  it('returns an empty list when the client has every model', () => {
    const missing = findMissingModels(makeFakeClient(REQUIRED_MODELS as unknown as string[]));
    expect(missing).toEqual([]);
  });

  it('flags a model whose delegate is not an object (e.g. undefined)', () => {
    const partial: any = makeFakeClient(REQUIRED_MODELS as unknown as string[]);
    delete partial.product;
    const missing = findMissingModels(partial);
    expect(missing).toContain('product');
  });

  it('flags a model whose delegate lacks a query method (unlikely but defensive)', () => {
    const partial: any = makeFakeClient(REQUIRED_MODELS as unknown as string[]);
    partial.user = { findFirst: undefined };
    const missing = findMissingModels(partial);
    expect(missing).toContain('user');
  });
});

describe('assertPrismaClientIsCurrent', () => {
  it('throws StalePrismaClientError on a stale client, naming the missing models', () => {
    expect(() => assertPrismaClientIsCurrent({} as any)).toThrowError(
      StalePrismaClientError,
    );
  });
  it('does not throw when every model is present', () => {
    expect(() =>
      assertPrismaClientIsCurrent(makeFakeClient(REQUIRED_MODELS as unknown as string[])),
    ).not.toThrow();
  });
});

describe('stalePrismaClientHelp', () => {
  it('mentions every missing model', () => {
    const lines = stalePrismaClientHelp(['product', 'themeSettings']);
    const text = lines.join('\n');
    expect(text).toMatch(/product/);
    expect(text).toMatch(/themeSettings/);
    expect(text).toMatch(/prisma generate/);
    expect(text).toMatch(/db:deploy/);
  });
});
