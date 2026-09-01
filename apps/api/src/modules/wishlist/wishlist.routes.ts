// ---------------------------------------------------------------------------
// Wishlist (mounted at /api/wishlist) - always logged-in (the account
// page), one row per (userId, productId) via the composite key.
//
// POST /move-to-cart is the "move to cart" button: it creates the cart
// row and deletes the wishlist row. Like POST /api/cart/sync it does NOT
// take a stock reservation (a plain cartItem.create), so the hold is only
// established when the customer re-adds the item through the normal cart
// flow or places the order.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schema
const addToWishlistSchema = z.object({
  productId: z.string().uuid(),
});

// GET /api/wishlist - Get user's wishlist
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const wishlistItems = await prisma.wishlistItem.findMany({
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
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: wishlistItems,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/wishlist - Add item to wishlist
router.post('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const validatedData = addToWishlistSchema.parse(req.body);
    const { productId } = validatedData;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true },
    });

    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }

    // Check if already in wishlist
    const existing = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ status: 'error', message: 'Product already in wishlist' });
    }

    // Add to wishlist
    const wishlistItem = await prisma.wishlistItem.create({
      data: {
        userId,
        productId,
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
      },
    });

    logger.info(`Product added to wishlist: ${product.name} by user ${userId}`);

    res.status(201).json({
      status: 'success',
      data: wishlistItem,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/wishlist/:productId - Remove item from wishlist
router.delete('/:productId', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { productId } = req.params;

    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    // Find wishlist item
    const wishlistItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!wishlistItem) {
      return res.status(404).json({ status: 'error', message: 'Item not found in wishlist' });
    }

    // Remove from wishlist
    await prisma.wishlistItem.delete({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    res.json({
      status: 'success',
      message: 'Item removed from wishlist',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/wishlist/check - Check if product is in wishlist
router.post('/check', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { productId } = req.body;

    const item = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    res.json({
      status: 'success',
      data: {
        inWishlist: !!item,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/wishlist/move-to-cart - Move wishlist item to cart
router.post('/move-to-cart', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { productId, quantity } = req.body;

    // Same quantity contract as the cart add route: a plain `quantity || 1`
    // would let -5, 1.5, 'abc' or 1e9 land in the cart (negative/fractional
    // quantities corrupt the reservation flow and the totals shown at
    // checkout). Missing/undefined -> 1; anything else must be an integer
    // in [1, 99999] (null included — it fails, like the cart schema).
    const parsedQuantity = z
      .number()
      .int()
      .min(1)
      .max(99999)
      .optional()
      .safeParse(quantity);
    if (!parsedQuantity.success) {
      return res.status(400).json({
        status: 'error',
        message: 'quantity must be an integer between 1 and 99999',
      });
    }
    const qty = parsedQuantity.data ?? 1;

    // Check if in wishlist
    const wishlistItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!wishlistItem) {
      return res.status(404).json({ status: 'error', message: 'Product not in wishlist' });
    }

    // The product must still exist and be purchasable — wishlist rows
    // are not cleaned up when a product is archived/deleted, and the
    // cart-add route enforces the same gate.
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true },
    });
    if (!product || product.status !== 'active') {
      await prisma.wishlistItem.delete({
        where: {
          userId_productId: { userId, productId },
        },
      });
      return res.status(404).json({
        status: 'error',
        message: 'Product is no longer available and was removed from your wishlist',
      });
    }

    // Add to cart
    const cartItem = await prisma.cartItem.create({
      data: {
        userId,
        productId,
        quantity: qty,
      },
    });

    // Remove from wishlist
    await prisma.wishlistItem.delete({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    res.json({
      status: 'success',
      data: cartItem,
      message: 'Item moved to cart',
    });
  } catch (err) {
    next(err);
  }
});

export default router;