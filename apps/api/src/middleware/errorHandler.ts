import { Request, Response, NextFunction } from 'express';
import { env, isDevelopment } from '../config/environment';
import { logger } from '../utils/logger';

// Custom error class
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
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