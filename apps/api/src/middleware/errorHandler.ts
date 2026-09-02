// ---------------------------------------------------------------------------
// The single error funnel for the whole API.
//
// Every route ends in `next(error)` on failure; this middleware (mounted
// last in app.ts, after notFoundHandler) is where that error becomes an
// HTTP response. The error classes below are the API's vocabulary for
// "known, expected" failures (400/401/403/404/409) - anything that is not
// an AppError is treated as a bug and becomes a 500. The branches for
// ZodError / Prisma / JWT / multer translate library errors into the same
// { status, message, code } shape so clients can rely on one contract.
// Several branches exist because of real outages documented inline.
// ---------------------------------------------------------------------------
import { Request, Response, NextFunction } from 'express';
import { env, isDevelopment } from '../config/environment';
import { Sentry, isSentryEnabled } from '../config/sentry';
import { logger } from '../utils/logger';

// Custom error class
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    // "Operational" = an expected failure the handler can describe to the
    // client. The handler responds directly for AppErrors and only 500s
    // for everything else.
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation error class
export class ValidationError extends AppError {
  errors: any[];

  constructor(message: string, errors: any[]) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

// Not found error class
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// Unauthorized error class
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// Forbidden error class
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

// Conflict error class
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

// Error handler middleware
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Error tracking (opt-in via SENTRY_DSN). Capture here, at the single
  // funnel every error passes through: the branches below all respond
  // directly without next(err), so no handler mounted after this one can
  // see the error. expressIntegration() (config/sentry.ts) binds the
  // current request's span to the isolation scope, so the event lands on
  // the right request.
  if (isSentryEnabled()) {
    Sentry.captureException(err, {
      extra: { url: req.url, method: req.method, code: (err as any).code },
    });
  }

  // Handle known operational errors
  if (err instanceof AppError) {
    const response: any = {
      status: 'error',
      message: err.message,
      code: err.code,
    };

    // Add validation errors if present
    if (err instanceof ValidationError) {
      response.errors = err.errors;
    }

    return res.status(err.statusCode).json(response);
  }

  // Handle Zod validation errors -> 400 with field details.
  // Without this, every `schema.parse()` failure in any module fell through
  // to the generic 500 handler, hiding the real cause from API clients.
  if (err.name === 'ZodError' && Array.isArray((err as any).issues)) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: (err as any).issues.map((i: any) => ({
        field: Array.isArray(i.path) ? i.path.join('.') : String(i.path ?? ''),
        message: i.message,
      })),
    });
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    
    switch (prismaError.code) {
      case 'P2002':
        return res.status(409).json({
          status: 'error',
          message: 'A record with this value already exists',
          code: 'DUPLICATE_ENTRY',
          field: prismaError.meta?.target,
        });
      
      case 'P2025':
        return res.status(404).json({
          status: 'error',
          message: 'Record not found',
          code: 'NOT_FOUND',
        });
      
      case 'P2003':
        return res.status(400).json({
          status: 'error',
          message: 'Related record not found',
          code: 'FOREIGN_KEY_ERROR',
        });
      
      // P2021 = table does not exist, P2022 = column does not exist.
      // These almost always mean the database is behind the code because
      // migrations were not run after pulling. The old generic
      // "Database error occurred" gave no clue, so the symptom looked like
      // "the admin page won't save" rather than "run your migrations".
      case 'P2021':
      case 'P2022': {
        const missing = prismaError.meta?.table || prismaError.meta?.column || 'A table';
        return res.status(500).json({
          status: 'error',
          message:
            `${missing} does not exist in the database. Your database is out of date - ` +
            `run \`npm run db:deploy\` (or \`npm run setup\`) in apps/api, then restart the API.`,
          code: 'MIGRATION_REQUIRED',
        });
      }

      default:
        return res.status(400).json({
          status: 'error',
          message: 'Database error occurred',
          code: 'DATABASE_ERROR',
        });
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'error',
      message: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
  }

  // Handle multer errors (file upload)
  if (err.name === 'MulterError') {
    const multerError = err as any;
    
    switch (multerError.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          status: 'error',
          message: 'File too large',
          code: 'FILE_TOO_LARGE',
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          status: 'error',
          message: 'Too many files',
          code: 'TOO_MANY_FILES',
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          status: 'error',
          message: 'Unexpected field',
          code: 'UNEXPECTED_FIELD',
        });
    }
  }

  // Handle syntax errors (invalid JSON)
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid JSON',
      code: 'INVALID_JSON',
    });
  }

  // A stale generated Prisma client shows up as a TypeError on an undefined
  // model delegate, e.g. `prisma.themeSettings` is undefined because the
  // client was generated before that model existed:
  //
  //   TypeError: Cannot read properties of undefined (reading 'findUnique')
  //
  // That message is impossible to act on. Translate it into the fix. We match
  // on the query-method name so ordinary application TypeErrors are unaffected.
  if (
    err instanceof TypeError &&
    /Cannot read propert(?:y|ies) of undefined \(reading '(findUnique|findFirst|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)'\)/.test(
      err.message
    )
  ) {
    return res.status(500).json({
      status: 'error',
      message:
        'The API is running against an out-of-date Prisma client, so this model ' +
        'does not exist yet. Run `npx prisma generate` in apps/api (then ' +
        '`npm run db:deploy` if you also pulled new migrations) and restart the API.',
      code: 'PRISMA_CLIENT_STALE',
      ...(isDevelopment && { stack: err.stack }),
    });
  }

  // Default error response
  const statusCode = 500;
  const message = isDevelopment ? err.message : 'Internal server error';

  res.status(statusCode).json({
    status: 'error',
    message,
    code: 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: err.stack }),
  });
};

export default errorHandler;