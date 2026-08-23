/**
 * errorHandler.ts — the central exception→HTTP-response translator.
 *
 * The handler is the only place that decides what shape an error response
 * takes. Tests exercise every branch because a regression here is what
 * turns a "well-known" 409 into a 500 (or vice versa) and breaks every
 * client of the API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  errorHandler,
} from '../../../src/middleware/errorHandler';

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeRes(): MockRes {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json };
}

function makeReq(): any {
  // The error handler reads ip, method, url, and User-Agent via req.get().
  // A minimal stub that covers the access pattern.
  return {
    method: 'GET',
    url: '/api/test',
    ip: '127.0.0.1',
    get(name: string) {
      if (name === 'User-Agent') return 'vitest';
      return undefined;
    },
  };
}

function lastJson(res: MockRes) {
  // status(...).json(...) is the chain
  const chain = (res.status.mock.results[0].value as any);
  return chain.json.mock.calls[0][0];
}

describe('custom error classes', () => {
  it('AppError captures the message and status code', () => {
    const e = new AppError('boom', 418, 'TEAPOT');
    expect(e.message).toBe('boom');
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('TEAPOT');
    expect(e.isOperational).toBe(true);
    expect(e).toBeInstanceOf(Error);
  });

  it('ValidationError extends AppError with 400/VALIDATION_ERROR and the field list', () => {
    const e = new ValidationError('bad', [{ field: 'x', message: 'required' }]);
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.errors).toEqual([{ field: 'x', message: 'required' }]);
  });

  it('NotFoundError formats the resource name into the message', () => {
    const e = new NotFoundError('Product');
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe('Product not found');
  });

  it('UnauthorizedError defaults to 401 and a standard message', () => {
    const e = new UnauthorizedError();
    expect(e.statusCode).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenError defaults to 403', () => {
    const e = new ForbiddenError();
    expect(e.statusCode).toBe(403);
  });

  it('ConflictError uses 409/CONFLICT', () => {
    const e = new ConflictError('dup');
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('CONFLICT');
  });
});

describe('errorHandler — known AppError', () => {
  it('returns the error as a structured JSON response', () => {
    const res = makeRes();
    errorHandler(new AppError('x', 400, 'CUSTOM'), makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(lastJson(res)).toMatchObject({
      status: 'error',
      message: 'x',
      code: 'CUSTOM',
    });
  });

  it('includes the field errors when a ValidationError comes through', () => {
    const res = makeRes();
    const err = new ValidationError('bad', [{ field: 'a', message: 'm' }]);
    errorHandler(err, makeReq(), res as any, vi.fn());
    expect(lastJson(res).errors).toEqual([{ field: 'a', message: 'm' }]);
  });
});

describe('errorHandler — ZodError', () => {
  it('translates zod issues into a 400 with field-level details', () => {
    const res = makeRes();
    const zodError: any = new Error('invalid');
    zodError.name = 'ZodError';
    zodError.issues = [
      { path: ['email'], message: 'Invalid email' },
      { path: ['profile', 'zip'], message: 'Required' },
    ];
    errorHandler(zodError, makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    const body = lastJson(res);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.errors).toEqual([
      { field: 'email', message: 'Invalid email' },
      { field: 'profile.zip', message: 'Required' },
    ]);
  });
});

describe('errorHandler — Prisma errors', () => {
  function prismaError(code: string, meta: any = {}): any {
    const e: any = new Error('prisma');
    e.name = 'PrismaClientKnownRequestError';
    e.code = code;
    e.meta = meta;
    return e;
  }

  it('P2002 -> 409 DUPLICATE_ENTRY with target field', () => {
    const res = makeRes();
    errorHandler(
      prismaError('P2002', { target: ['email'] }),
      makeReq(),
      res as any,
      vi.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(lastJson(res)).toMatchObject({ code: 'DUPLICATE_ENTRY', field: ['email'] });
  });

  it('P2025 -> 404 NOT_FOUND', () => {
    const res = makeRes();
    errorHandler(prismaError('P2025'), makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(lastJson(res).code).toBe('NOT_FOUND');
  });

  it('P2003 -> 400 FOREIGN_KEY_ERROR', () => {
    const res = makeRes();
    errorHandler(prismaError('P2003'), makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(lastJson(res).code).toBe('FOREIGN_KEY_ERROR');
  });

  it('P2021 (table missing) -> 500 MIGRATION_REQUIRED with a fix instruction', () => {
    const res = makeRes();
    errorHandler(
      prismaError('P2021', { table: 'Product' }),
      makeReq(),
      res as any,
      vi.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(500);
    const body = lastJson(res);
    expect(body.code).toBe('MIGRATION_REQUIRED');
    expect(body.message).toMatch(/Product/);
    expect(body.message).toMatch(/db:deploy/);
  });

  it('P2022 (column missing) -> 500 MIGRATION_REQUIRED', () => {
    const res = makeRes();
    errorHandler(
      prismaError('P2022', { column: 'thingId' }),
      makeReq(),
      res as any,
      vi.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(lastJson(res).code).toBe('MIGRATION_REQUIRED');
  });

  it('Unknown prisma code -> 400 DATABASE_ERROR', () => {
    const res = makeRes();
    errorHandler(prismaError('P9999'), makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(lastJson(res).code).toBe('DATABASE_ERROR');
  });
});

describe('errorHandler — JWT errors', () => {
  it('JsonWebTokenError -> 401 INVALID_TOKEN', () => {
    const res = makeRes();
    const e: any = new Error('bad');
    e.name = 'JsonWebTokenError';
    errorHandler(e, makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(lastJson(res).code).toBe('INVALID_TOKEN');
  });

  it('TokenExpiredError -> 401 TOKEN_EXPIRED', () => {
    const res = makeRes();
    const e: any = new Error('expired');
    e.name = 'TokenExpiredError';
    errorHandler(e, makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(lastJson(res).code).toBe('TOKEN_EXPIRED');
  });
});

describe('errorHandler — multer', () => {
  function multerErr(code: string): any {
    const e: any = new Error('multer');
    e.name = 'MulterError';
    e.code = code;
    return e;
  }

  it('LIMIT_FILE_SIZE -> 400 FILE_TOO_LARGE', () => {
    const res = makeRes();
    errorHandler(multerErr('LIMIT_FILE_SIZE'), makeReq(), res as any, vi.fn());
    expect(lastJson(res).code).toBe('FILE_TOO_LARGE');
  });

  it('LIMIT_FILE_COUNT -> 400 TOO_MANY_FILES', () => {
    const res = makeRes();
    errorHandler(multerErr('LIMIT_FILE_COUNT'), makeReq(), res as any, vi.fn());
    expect(lastJson(res).code).toBe('TOO_MANY_FILES');
  });

  it('LIMIT_UNEXPECTED_FILE -> 400 UNEXPECTED_FIELD', () => {
    const res = makeRes();
    errorHandler(multerErr('LIMIT_UNEXPECTED_FILE'), makeReq(), res as any, vi.fn());
    expect(lastJson(res).code).toBe('UNEXPECTED_FIELD');
  });
});

describe('errorHandler — fallback', () => {
  it('Invalid JSON (SyntaxError on body) -> 400 INVALID_JSON', () => {
    const res = makeRes();
    const e: any = new SyntaxError('bad json');
    e.body = '...';
    errorHandler(e, makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(lastJson(res).code).toBe('INVALID_JSON');
  });

  it('Stale prisma client (TypeError on undefined.<method>) -> 500 PRISMA_CLIENT_STALE', () => {
    const res = makeRes();
    const e: any = new TypeError(
      "Cannot read properties of undefined (reading 'findUnique')",
    );
    errorHandler(e, makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(lastJson(res).code).toBe('PRISMA_CLIENT_STALE');
    expect(lastJson(res).message).toMatch(/prisma generate/);
  });

  it('Random TypeError falls through to the generic 500', () => {
    const res = makeRes();
    errorHandler(new TypeError('nope'), makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(lastJson(res).code).toBe('INTERNAL_ERROR');
  });

  it('Unknown error -> 500 INTERNAL_ERROR', () => {
    const res = makeRes();
    errorHandler(new Error('boom'), makeReq(), res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(lastJson(res).code).toBe('INTERNAL_ERROR');
  });
});
