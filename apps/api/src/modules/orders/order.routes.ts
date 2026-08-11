import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { NotFoundError, AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { sendOrderConfirmation, sendShippingNotification } from '../../services/email.service';

const router = Router();

// GET /api/orders - Get orders (filtered by user or all for admin)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status as string;

    // Build where clause
    const where: any = {};
    
    // Non-admin users can only see their own orders
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      where.userId = req.user?.id;
    }
    
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: {
                    where: { isPrimary: true },
                    take: 1,
                  },
                },
              },
            },
          },
          shippingAddress: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      status: 'success',
      data: orders,
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

// GET /api/orders/:id - Get order by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                images: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
            variant: true,
          },
        },
        shippingAddress: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    // Non-admin users can only view their own orders
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager' && order.userId !== req.user?.id) {
      throw new AppError('Forbidden', 403);
    }

    res.json({
      status: 'success',
      data: order,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/orders - Create new order
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { items, shippingAddressId, shippingAddress, paymentMethod, notes, 
            couponCode, couponId, discountAmount, subtotal, shippingAmount, taxAmount, totalAmount } = req.body;

    if (!items || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }

    // Handle shipping address - either ID or full object
    let addressId = shippingAddressId;
    
    if (!addressId && shippingAddress) {
      // Create address from full object
      const newAddress = await prisma.address.create({
        data: {
          userId: req.user!.id,
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          address1: shippingAddress.address,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postalCode: shippingAddress.zipCode,
          country: shippingAddress.country || 'US',
          phone: shippingAddress.phone,
          type: 'shipping',
        },
      });
      addressId = newAddress.id;
    }

    // Calculate order totals if not provided
    let calculatedSubtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          variants: item.variantId ? {
            where: { id: item.variantId },
          } : undefined,
        },
      });

      if (!product) {
        throw new AppError(`Product not found: ${item.productId}`, 400);
      }

      if (product.status !== 'active') {
        throw new AppError(`Product is not available: ${product.name}`, 400);
      }

      // Check inventory
      if (product.trackInventory) {
        const availableQuantity = item.variantId 
          ? product.variants[0]?.quantity || 0
          : product.quantity;

        if (availableQuantity < item.quantity) {
          throw new AppError(`Insufficient stock for ${product.name}`, 400);
        }
      }

      const unitPrice = item.variantId && product.variants[0]
        ? Number(product.variants[0].price)
        : Number(product.price);

      const totalPrice = unitPrice * item.quantity;
      calculatedSubtotal += totalPrice;

      orderItems.push({
        productId: item.productId,
        variantId: item.variantId || null,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      });
    }

    // Use provided amounts or calculated ones
    const finalSubtotal = subtotal || calculatedSubtotal;
    const finalTaxAmount = taxAmount || (finalSubtotal * 0.10);
    const finalShippingAmount = shippingAmount !== undefined ? shippingAmount : (finalSubtotal >= 100 ? 0 : 10);
    const finalDiscountAmount = discountAmount || 0;
    const finalTotalAmount = totalAmount || (finalSubtotal + finalTaxAmount + finalShippingAmount - finalDiscountAmount);

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: req.user!.id,
        status: 'pending',
        subtotal: finalSubtotal,
        taxAmount: finalTaxAmount,
        shippingAmount: finalShippingAmount,
        discountAmount: finalDiscountAmount,
        totalAmount: finalTotalAmount,
        shippingAddressId: addressId,
        shippingMethodId: req.body.shippingMethodId,
        paymentMethod,
        paymentStatus: 'pending',
        notes,
        items: {
          create: orderItems,
        },
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
          },
        },
        shippingAddress: true,
      },
    });

    // Update inventory
    for (const item of items) {
      if (item.variantId) {
        await prisma.productVariant.update({
          where: { id: item.variantId },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        });
      } else {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        });
      }
    }

    // Clear user's cart
    await prisma.cartItem.deleteMany({
      where: { userId: req.user!.id },
    });

    logger.info(`Order created: ${order.orderNumber} by user ${req.user!.email}`);

    // Track coupon usage if coupon was applied
    if (couponId) {
      await prisma.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } },
      }).catch(err => logger.error('Failed to update coupon usage:', err));
    }

    // Send order confirmation email (non-blocking)
    const orderUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { firstName: true, lastName: true, email: true },
    });
    
    if (orderUser) {
      sendOrderConfirmation({
        ...order,
        items: order.items,
      }, orderUser).catch(err => {
        logger.error('Failed to send order confirmation:', err);
      });
    }

    res.status(201).json({
      status: 'success',
      data: order,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/orders/:id/status - Update order status (admin only)
router.put('/:id/status', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, adminNotes } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    const updateData: any = { status };

    if (trackingNumber) {
      updateData.trackingNumber = trackingNumber;
    }

    if (adminNotes) {
      updateData.adminNotes = adminNotes;
    }

    // Set timestamps based on status
    switch (status) {
      case 'shipped':
        updateData.shippedAt = new Date();
        break;
      case 'delivered':
        updateData.deliveredAt = new Date();
        break;
      case 'cancelled':
        updateData.cancelledAt = new Date();
        break;
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    logger.info(`Order ${order.orderNumber} status updated to ${status}`);

    // Send shipping notification email when status changes to shipped
    if (status === 'shipped' && trackingNumber) {
      const orderUser = await prisma.user.findUnique({
        where: { id: order.userId },
        select: { firstName: true, lastName: true, email: true },
      });

      if (orderUser) {
        sendShippingNotification(updatedOrder, orderUser, trackingNumber).catch(err => {
          logger.error('Failed to send shipping notification:', err);
        });
      }
    }

    res.json({
      status: 'success',
      data: updatedOrder,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/orders/:id/cancel - Cancel order
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order');
    }

    // Users can only cancel their own orders
    if (req.user?.role !== 'admin' && order.userId !== req.user?.id) {
      throw new AppError('Forbidden', 403);
    }

    // Can only cancel pending or processing orders
    if (!['pending', 'processing'].includes(order.status)) {
      throw new AppError('Order cannot be cancelled', 400);
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        notes: reason ? `Cancelled: ${reason}` : undefined,
      },
    });

    // Restore inventory
    for (const item of order.items) {
      if (item.variantId) {
        await prisma.productVariant.update({
          where: { id: item.variantId },
          data: {
            quantity: {
              increment: item.quantity,
            },
          },
        });
      } else {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            quantity: {
              increment: item.quantity,
            },
          },
        });
      }
    }

    logger.info(`Order ${order.orderNumber} cancelled`);

    res.json({
      status: 'success',
      data: updatedOrder,
    });
  } catch (error) {
    next(error);
  }
});

export default router;