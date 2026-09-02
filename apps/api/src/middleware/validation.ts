// ---------------------------------------------------------------------------
// Zod validation middleware + a small HTML-escaping toolkit.
//
// validate() runs a schema over req.body|query|params and REPLACES the
// original with the parsed (coerced + defaulted) value, so handlers read
// clean, typed data. A schema failure becomes a ValidationError (400 via
// the global error handler) - a bad request never reaches the route.
// ---------------------------------------------------------------------------
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from './errorHandler';

// Validation middleware factory
export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      
      // Replace request data with validated data
      req[source] = validated;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        next(new ValidationError('Validation failed', errors));
      } else {
        next(error);
      }
    }
  };
};

// Validate request body
export const validateBody = (schema: ZodSchema) => validate(schema, 'body');

// Validate query parameters
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query');

// Validate URL parameters
export const validateParams = (schema: ZodSchema) => validate(schema, 'params');

// Common validation schemas (regex/pattern helpers, not Zod schemas -
// used inline where a full schema would be overkill).
export const commonSchemas = {
  // UUID parameter
  uuidParam: {
    id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
  
  // Pagination query
  pagination: {
    page: { type: 'string', pattern: '^[0-9]+$', default: '1' },
    limit: { type: 'string', pattern: '^[0-9]+$', default: '20' },
  },
  
  // Sort query
  sort: {
    sort: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    sortBy: { type: 'string', default: 'createdAt' },
  },
};

// HTML-escape a string. This is OUTPUT escaping for values rendered into
// HTML (e.g. email subjects) - it is NOT a rich-text sanitizer; the
// storefront's rich text goes through utils/sanitizeRichText.ts instead.
export const sanitizeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Sanitize object
export const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeHtml(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      sanitized[key] = sanitizeObject(obj[key]);
    }
    return sanitized;
  }
  
  return obj;
};

// Sanitize middleware
export const sanitize = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

export default validate;