/**
 * notFoundHandler — last-resort 404 with a list of available endpoints.
 */
import { describe, it, expect, vi } from 'vitest';
import { notFoundHandler } from '../../../src/middleware/notFoundHandler';

describe('notFoundHandler', () => {
  it('returns 404 with a descriptive message and a hint of the available endpoints', () => {
    const req: any = { method: 'POST', url: '/api/nonsense' };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();
    notFoundHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.status).toBe('error');
    expect(body.code).toBe('ROUTE_NOT_FOUND');
    expect(body.message).toMatch(/POST/);
    expect(body.message).toMatch(/\/api\/nonsense/);
    expect(body.availableEndpoints.products).toBe('/api/products');
    expect(body.availableEndpoints.auth).toBe('/api/auth');
    expect(next).not.toHaveBeenCalled();
  });
});
