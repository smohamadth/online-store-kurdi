import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { NotFoundError, AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

const router = Router();

// GET /api/payments - Get payments (admin only)
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              userId: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.count(),
    ]);

    res.json({
      status: 'success',
      data: payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/process - Process payment (mock implementation)
router.post('/process', authenticate, async (req, res, next) => {
  try {
    const { orderId, paymentMethod, paymentDetails } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.userId !== req.user?.id && req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    if (order.paymentStatus === 'completed') {
      throw new AppError('Order already paid', 400);
    }

    // Mock payment processing
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount: order.totalAmount,
        currency: 'USD',
        method: paymentMethod || 'stripe',
        status: 'completed',
        transactionId,
        gatewayResponse: {
          success: true,
          transactionId,
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Update order payment status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'completed',
        paymentIntentId: transactionId,
        status: 'processing',
      },
    });

    logger.info(`Payment processed for order ${order.orderNumber}: ${transactionId}`);

    res.json({
      status: 'success',
      data: payment,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/refund - Process refund (admin only)
router.post('/refund', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { orderId, amount, reason } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.paymentStatus !== 'completed') {
      throw new AppError('Order payment not completed', 400);
    }

    // Create refund payment record
    const refund = await prisma.payment.create({
      data: {
        orderId,
        amount: amount || order.totalAmount,
        currency: 'USD',
        method: 'refund',
        status: 'completed',
        transactionId: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        gatewayResponse: {
          success: true,
          reason,
          originalTransaction: order.paymentIntentId,
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'refunded',
        status: 'refunded',
      },
    });

    logger.info(`Refund processed for order ${order.orderNumber}`);

    res.json({
      status: 'success',
      data: refund,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/payments/order/:orderId - Get payments for order
router.get('/order/:orderId', authenticate, async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.userId !== req.user?.id && req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const payments = await prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: payments,
    });
  } catch (error) {
    next(error);
  }
});

export default router;