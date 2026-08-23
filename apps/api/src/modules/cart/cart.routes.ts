import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';
import { createReservation, availableQuantity } from '../inventory/inventory.service';

const router = Router();

// Validation schemas
const addToCartSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).default(1),
});

const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1),
});

// GET /api/cart - Get user's cart
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            compareAtPrice: true,
            quantity: true,
            status: true,
            category: {
              select: { name: true, slug: true },
            },
            images: {
              where: { isPrimary: true },
              take: 1,
              select: { url: true, alt: true },
            },
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            quantity: true,
            attributes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate totals
    let subtotal = 0;
    let itemCount = 0;

    const items = cartItems.map(item => {
      const price = item.variant ? Number(item.variant.price) : Number(item.product.price);
      const itemTotal = price * item.quantity;
      subtotal += itemTotal;
      itemCount += item.quantity;

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price,
        total: itemTotal,
        product: item.product,
        variant: item.variant,
        createdAt: item.createdAt,
      };
    });

    res.json({
      status: 'success',
      data: {
        items,
        itemCount,
        subtotal: Math.round(subtotal * 100) / 100,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/cart - Add item to cart
router.post('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const validatedData = addToCartSchema.parse(req.body);
    const { productId, variantId, quantity } = validatedData;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, status: true, quantity: true },
    });

    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }

    if (product.status !== 'active') {
      return res.status(400).json({ status: 'error', message: 'Product is not available' });
    }

    // Check variant if provided
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { id: true, quantity: true, isActive: true },
      });

      if (!variant) {
        return res.status(404).json({ status: 'error', message: 'Variant not found' });
      }

      if (!variant.isActive) {
        return res.status(400).json({ status: 'error', message: 'Variant is not available' });
      }

      // Use available quantity (subtracts active reservations) so
      // two concurrent carts cannot grab the last unit.
      const avail = await availableQuantity(productId, variantId);
      if (avail < quantity) {
        return res.status(400).json({ status: 'error', message: 'Insufficient stock' });
      }
    } else {
      const avail = await availableQuantity(productId);
      if (avail < quantity) {
        return res.status(400).json({ status: 'error', message: 'Insufficient stock' });
      }
    }

    // Check if item already in cart
    let existingItem = null;
    
    if (variantId) {
      // If variant provided, find by product + variant
      existingItem = await prisma.cartItem.findFirst({
        where: {
          userId,
          productId,
          variantId,
        },
      });
    } else {
      // If no variant, find by product only (where variant is null)
      existingItem = await prisma.cartItem.findFirst({
        where: {
          userId,
          productId,
          variantId: null,
        },
      });
    }

    let cartItem;

    if (existingItem) {
      // Update quantity
      cartItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + quantity },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
          variant: true,
        },
      });
    } else {
      // Add new item
      cartItem = await prisma.cartItem.create({
        data: {
          userId,
          productId,
          variantId: variantId || null,
          quantity,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
          variant: true,
        },
      });
    }

    // Stock reservation: hold the items for 15 minutes so another
    // cart can't oversell. The reservation expires automatically;
    // at order-placement it is consumed (releasedAt is stamped).
    const RESERVATION_TTL_MIN = 15;
    const reservedUntil = new Date(Date.now() + RESERVATION_TTL_MIN * 60 * 1000);
    if (existingItem) {
      // The cartItem already has an active reservation tied to it.
      // Bumping the cart quantity bumps the reservation quantity
      // too; otherwise the reserved pool would not match the held
      // pool and the second cart would over-sell.
      const existingReservation = await prisma.stockReservation.findFirst({
        where: { cartItemId: existingItem.id, releasedAt: null },
      });
      if (existingReservation) {
        await prisma.stockReservation.update({
          where: { id: existingReservation.id },
          data: {
            quantity: existingItem.quantity + quantity, // the cartItem has already been updated above
            reservedUntil,
          },
        });
      } else {
        // Existing cartItem with no active reservation (e.g. the
        // reservation expired and the user re-added). Create a
        // fresh one.
        await prisma.stockReservation.create({
          data: {
            productId,
            variantId: variantId ?? null,
            quantity: existingItem.quantity + quantity,
            reservedUntil,
            reason: 'cart_hold',
            cartItemId: cartItem.id,
            originType: 'cart',
            originId: cartItem.id,
          },
        });
      }
    } else {
      await prisma.stockReservation.create({
        data: {
          productId,
          variantId: variantId ?? null,
          quantity,
          reservedUntil,
          reason: 'cart_hold',
          cartItemId: cartItem.id,
          originType: 'cart',
          originId: cartItem.id,
        },
      });
    }
    await prisma.cartItem.update({
      where: { id: cartItem.id },
      data: { reservedUntil },
    });

    logger.info(`Item added to cart: ${product.name} by user ${userId}`);

    res.json({
      status: 'success',
      data: cartItem,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/cart/:id - Update cart item quantity
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const validatedData = updateCartItemSchema.parse(req.body);

    // Find cart item
    const cartItem = await prisma.cartItem.findUnique({
      where: { id },
      include: { product: true, variant: true },
    });

    if (!cartItem) {
      return res.status(404).json({ status: 'error', message: 'Cart item not found' });
    }

    if (cartItem.userId !== userId) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    // Check stock
    const availableQuantity = cartItem.variant 
      ? cartItem.variant.quantity 
      : cartItem.product.quantity;

    if (availableQuantity < validatedData.quantity) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Insufficient stock',
        available: availableQuantity,
      });
    }

    // Update quantity
    const updatedItem = await prisma.cartItem.update({
      where: { id },
      data: { quantity: validatedData.quantity },
    });

    res.json({
      status: 'success',
      data: updatedItem,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cart/:id - Remove item from cart
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    // Find cart item
    const cartItem = await prisma.cartItem.findUnique({
      where: { id },
    });

    if (!cartItem) {
      return res.status(404).json({ status: 'error', message: 'Cart item not found' });
    }

    if (cartItem.userId !== userId) {
      return res.status(403).json({ status: 'error', message: 'Forbidden' });
    }

    // Delete item
    await prisma.cartItem.delete({ where: { id } });

    res.json({
      status: 'success',
      message: 'Item removed from cart',
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cart - Clear cart
router.delete('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    // Delete all items
    await prisma.cartItem.deleteMany({
      where: { userId },
    });

    res.json({
      status: 'success',
      message: 'Cart cleared',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/cart/sync - Sync local cart with database
router.post('/sync', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ status: 'error', message: 'Invalid items' });
    }

    // Clear existing cart
    await prisma.cartItem.deleteMany({
      where: { userId },
    });

    // Add items from local cart
    const cartItems = [];
    for (const item of items) {
      // Check if item already exists
      const existing = await prisma.cartItem.findFirst({
        where: {
          userId,
          productId: item.productId,
          variantId: item.variantId || null,
        },
      });

      if (existing) {
        // Update quantity
        const updated = await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + (item.quantity || 1) },
        });
        cartItems.push(updated);
      } else {
        // Create new item
        const cartItem = await prisma.cartItem.create({
          data: {
            userId,
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity || 1,
          },
        });
        cartItems.push(cartItem);
      }
    }

    logger.info(`Cart synced for user ${userId}: ${cartItems.length} items`);

    res.json({
      status: 'success',
      data: cartItems,
    });
  } catch (err) {
    next(err);
  }
});

export default router;