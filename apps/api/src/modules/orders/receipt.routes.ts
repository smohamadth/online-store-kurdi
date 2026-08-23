/**
 * Receipt endpoints.
 *
 *   GET /api/orders/:id/receipt         - printable HTML
 *   GET /api/orders/:id/receipt.pdf     - PDF download
 *   GET /api/orders/:id/receipt.json    - structured data (for tests / integrations)
 *
 * Authorization: the order's owner OR an admin/manager. Customers
 * downloading their own receipts is the common path; admins
 * download on behalf of the customer (refund support, accounting).
 */
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import {
  assembleReceiptData,
  renderReceiptHtml,
  renderReceiptPdf,
} from './receipt.service';

const router = Router();

/**
 * Reject the request unless the caller is the order's owner or
 * an admin/manager. Returns the order for convenience so the
 * route handlers don't have to re-fetch.
 */
async function authorizeOrderAccess(req: any, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404);
  const user = req.user;
  const isOwner = order.userId === user?.id;
  const isPrivileged = user?.role === 'admin' || user?.role === 'manager';
  if (!isOwner && !isPrivileged) {
    throw new AppError('Forbidden', 403);
  }
  return order;
}

// GET /api/orders/:id/receipt - HTML
router.get('/:id/receipt', authenticate, async (req, res, next) => {
  try {
    await authorizeOrderAccess(req, req.params.id);
    const data = await assembleReceiptData(req.params.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReceiptHtml(data));
  } catch (err) { next(err); }
});

// GET /api/orders/:id/receipt.pdf - PDF
router.get('/:id/receipt.pdf', authenticate, async (req, res, next) => {
  try {
    const order = await authorizeOrderAccess(req, req.params.id);
    const data = await assembleReceiptData(req.params.id);
    const pdf = await renderReceiptPdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${order.orderNumber}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// GET /api/orders/:id/receipt.json - structured data
router.get('/:id/receipt.json', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    await authorizeOrderAccess(req, req.params.id);
    const data = await assembleReceiptData(req.params.id);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
});

export default router;
