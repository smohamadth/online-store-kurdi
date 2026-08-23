/**
 * validation.ts — Zod-driven request validator + the `sanitizeHtml` /
 * `sanitizeObject` helpers it exports.
 *
 * The router uses these for every POST/PUT body. They guard against bad
 * data going into prisma (and stored XSS via the sanitiser). Tests cover
 * the success path, the failure path (does it call `next` with a
 * ValidationError?), and each source variant (body / query / params).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  sanitizeHtml,
  sanitizeObject,
  sanitize,
} from '../../../src/middleware/validation';
import { ValidationError } from '../../../src/middleware/errorHandler';

const makeReq = (over: Partial<{ body: any; query: any; params: any }> = {}) => ({
  body: {},
  query: {},
  params: {},
  ...over,
} as any);

describe('validate middleware', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('replaces the source with the parsed (and transformed) value', () => {
    const req = makeReq({ body: { name: 'ok' } });
    const next = vi.fn();
    validate(schema)(
      req,
      { json: vi.fn() } as any,
      next,
    );
    expect(next).toHaveBeenCalledWith(); // no error
    expect(req.body).toEqual({ name: 'ok' });
  });

  it('calls next with a ValidationError when zod fails', () => {
    const req = makeReq({ body: { name: '' } });
    const next = vi.fn();
    validate(schema)(req, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.errors.length).toBeGreaterThan(0);
    expect(err.errors[0]).toMatchObject({ field: 'name' });
  });

  it('passes the error to next when something other than zod throws', () => {
    const boom = new Error('boom');
    const customSchema = {
      parse: () => {
        throw boom;
      },
    } as any;
    const req = makeReq();
    const next = vi.fn();
    validate(customSchema)(req, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledWith(boom);
  });

  it('validates from query string when source=query', () => {
    const req = makeReq({ query: { page: '5' } });
    const next = vi.fn();
    const q = z.object({ page: z.string().transform(Number) });
    validateQuery(q)(req, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ page: 5 });
  });

  it('validates from params when source=params', () => {
    const req = makeReq({ params: { id: 'abc' } });
    const next = vi.fn();
    const p = z.object({ id: z.string().min(1) });
    validateParams(p)(req, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ id: 'abc' });
  });

  it('reuses the `validate` factory for the body alias', () => {
    const req = makeReq({ body: { x: 1 } });
    const next = vi.fn();
    const s = z.object({ x: z.number() });
    validateBody(s)(req, { json: vi.fn() } as any, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('sanitizeHtml', () => {
  it('escapes the five HTML characters', () => {
    expect(sanitizeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;',
    );
  });

  it('handles empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('sanitizeObject', () => {
  it('sanitises strings recursively', () => {
    const obj = { a: '<b>', b: ['<i>', 'plain'], c: { d: '<' } };
    const out = sanitizeObject(obj);
    expect(out.a).toBe('&lt;b&gt;');
    expect(out.b[0]).toBe('&lt;i&gt;');
    expect(out.b[1]).toBe('plain');
    expect(out.c.d).toBe('&lt;');
  });

  it('passes through non-strings and primitives unchanged', () => {
    expect(sanitizeObject(123 as any)).toBe(123);
    expect(sanitizeObject(true as any)).toBe(true);
    expect(sanitizeObject(null as any)).toBe(null);
  });
});

describe('sanitize middleware', () => {
  it('sanitises req.body and req.query in place', () => {
    const req = makeReq({ body: { a: '<b>' }, query: { q: '<q>' } });
    const next = vi.fn();
    sanitize(req, { json: vi.fn() } as any, next);
    expect(req.body).toEqual({ a: '&lt;b&gt;' });
    expect(req.query).toEqual({ q: '&lt;q&gt;' });
    expect(next).toHaveBeenCalledWith();
  });
});
