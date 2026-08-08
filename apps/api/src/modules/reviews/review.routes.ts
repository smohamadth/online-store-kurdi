import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

const router = Router();

// GET /api/products/:productId/reviews - Get reviews for a product
router.get('/products/:productId/reviews', async (req, res, next) => {
  try {
    const { productId } = req.params;

    const reviews = await prisma.review.findMany({
      where: {
        productId,
        isApproved: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: reviews,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:productId/reviews - Add a review
router.post('/products/:productId/reviews', authenticate, async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Rating must be between 1 and 5',
      });
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Product not found',
      });
    }

    // Check if user already reviewed this product
    const existingReview = await prisma.review.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingReview) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reviewed this product',
      });
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        userId,
        productId,
        rating: parseInt(rating),
        title: title || null,
        comment: comment || null,
        isVerified: true,
        isApproved: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    logger.info(`Review created for product ${productId} by user ${userId}`);

    res.status(201).json({
      status: 'success',
      data: review,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/reviews/:reviewId - Update a review
router.put('/reviews/:reviewId', authenticate, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user?.id;

    // Find review
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found',
      });
    }

    // Check ownership
    if (review.userId !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this review',
      });
    }

    // Update review
    const updatedReview = await prisma.review.update({
      where: { id: reviewId },
      data: {
        rating: rating ? parseInt(rating) : undefined,
        title: title !== undefined ? title : undefined,
        comment: comment !== undefined ? comment : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    res.json({
      status: 'success',
      data: updatedReview,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/reviews/:reviewId - Delete a review
router.delete('/reviews/:reviewId', authenticate, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.id;

    // Find review
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found',
      });
    }

    // Check ownership or admin
    if (review.userId !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this review',
      });
    }

    // Delete review
    await prisma.review.delete({
      where: { id: reviewId },
    });

    logger.info(`Review ${reviewId} deleted`);

    res.json({
      status: 'success',
      message: 'Review deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me/reviews - Get current user's reviews
router.get('/users/me/reviews', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const reviews = await prisma.review.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format response
    const formattedReviews = reviews.map(review => ({
      id: review.id,
      productId: review.productId,
      productName: review.product.name,
      productSlug: review.product.slug,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      createdAt: review.createdAt,
    }));

    res.json({
      status: 'success',
      data: formattedReviews,
    });
  } catch (err) {
    next(err);
  }
});

export default router;