// Terminal 404 for the API: mounted LAST in app.ts (after every route and
// before errorHandler), so any /api/* path that matched nothing lands here.
// The response deliberately lists the top-level endpoints: during the
// "wrong base URL" era of this project, a 404 that said nothing made
// misconfigured storefronts very hard to diagnose.
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.url} not found`,
    code: 'ROUTE_NOT_FOUND',
    availableEndpoints: {
      products: '/api/products',
      orders: '/api/orders',
      users: '/api/users',
      auth: '/api/auth',
      payments: '/api/payments',
      analytics: '/api/analytics',
      recommendations: '/api/recommendations',
      storage: '/api/storage',
    },
  });
};

export default notFoundHandler;